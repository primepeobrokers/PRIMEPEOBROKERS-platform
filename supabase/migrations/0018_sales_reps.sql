-- ===========================================================================
-- 0018: sales reps, view-only access scoped to the partners assigned to them
--
-- The client wants rep logins on the house console. A rep sees submissions
-- from the partners an admin assigns to them, and nothing else: no direct
-- (house) leads, no other partners, no partner settings, no writes. They work
-- leads in HubSpot and export from here.
--
-- WHY THIS IS A MIGRATION AND NOT A SCREEN
--
-- Every house invitee sent by staff becomes is_platform_staff (0009 section
-- 8), and tenant_scope() hands platform staff every tenant. And nothing in
-- the database is read-only by role: the submissions UPDATE policy, the 0006
-- column grant and the notes and events INSERT policies all key on
-- tenant_scope() alone. Hiding buttons would leave a rep one PostgREST call
-- away from every lead and every write. So the boundary is drawn here:
--
--   1. 'rep' joins the role check, and a rep can never be platform staff.
--   2. rep_partners records the many-to-many assignment. Written only by
--      set_partner_reps (section 9).
--   3. tenant_scope() gains a rep branch: the assigned partner tenants, never
--      the house. Every SELECT policy follows from that one function.
--   4. A rep reads its own profile row by id, since its home tenant is no
--      longer in its scope.
--   5. Writes refuse reps: submissions UPDATE, notes INSERT, and every
--      submission_events INSERT except the "opened" audit line.
--   6. is_house_member() excludes reps, which closes consent records (IP and
--      user agent) and record_sms_opt_out in one place.
--   7. handle_new_user and set_teammate_role learn the role, and keep the
--      staff flag consistent with it.
--   8. remove_teammate keeps a rep a rep, so Restore returns them intact.
--
-- tenant_events INSERT already requires is_admin(), and every partner-admin
-- RPC calls require_platform_staff(), so neither needs a change: a rep is
-- neither.
--
-- DEPLOY ORDER: migration first. Until it is applied the console's rep option
-- fails at the role check and the Partners "Reps" tab fails at the RPC.
-- Safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The role, and the invariant that a rep is never platform staff
--
-- 0001 declared the check inline, so Postgres named it. Look it up rather
-- than guess the name, then replace it with a named one.
-- ---------------------------------------------------------------------------

do $drop_role_check$
declare
  v_name text;
begin
  for v_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.profiles'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%role%'
       and pg_get_constraintdef(c.oid) ilike '%member%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_name);
  end loop;
end;
$drop_role_check$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'member', 'rep'));

alter table public.profiles
  drop constraint if exists profiles_rep_not_staff_chk;
alter table public.profiles
  add constraint profiles_rep_not_staff_chk
  check (role <> 'rep' or not is_platform_staff);


-- ---------------------------------------------------------------------------
-- 2. is_rep()
-- ---------------------------------------------------------------------------

create or replace function public.is_rep()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_rep$
  select coalesce(public.current_user_role() = 'rep', false);
$is_rep$;

grant  execute on function public.is_rep() to authenticated;
revoke execute on function public.is_rep() from public, anon;

-- The house tenant's id. Security definer because a policy expression runs
-- with the caller's privileges, and a rep cannot read the house tenant row
-- through RLS (section 4), so an inline subquery on tenants would be empty.
create or replace function public.house_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $house_tenant_id$
  select id from public.tenants where is_house;
$house_tenant_id$;

grant  execute on function public.house_tenant_id() to authenticated;
revoke execute on function public.house_tenant_id() from public, anon;


-- ---------------------------------------------------------------------------
-- 3. rep_partners
--
-- Both FKs cascade: removing a partner (0017) or a profile takes the
-- assignment with it. A deactivated rep keeps their rows, so a Restore puts
-- them back on the same partners; tenant_scope() and the lead emails both
-- filter on deactivated_at, so the rows are inert meanwhile.
-- ---------------------------------------------------------------------------

create table if not exists public.rep_partners (
  rep_id      uuid not null references public.profiles(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id)  on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (rep_id, tenant_id)
);

create index if not exists rep_partners_tenant_idx
  on public.rep_partners (tenant_id);

alter table public.rep_partners enable row level security;

revoke all    on public.rep_partners from public, anon, authenticated;
grant  select on public.rep_partners to authenticated;

-- Staff see every assignment (the Partners screen); a rep sees its own.
drop policy if exists "read rep assignments in scope" on public.rep_partners;
create policy "read rep assignments in scope"
  on public.rep_partners for select
  to authenticated
  using (
    rep_id = auth.uid()
    or tenant_id in (select public.tenant_scope())
  );


-- ---------------------------------------------------------------------------
-- 4. tenant_scope() gains the rep branch
--
-- Three mutually exclusive branches now: staff, rep, everyone else. The
-- third excludes reps explicitly, because a rep's home tenant is the house
-- and the old branch would have handed them every direct lead.
--
-- The rep branch checks the role on the rep's own live profile, so demoting
-- a rep or removing them empties the branch at once, before any cleanup of
-- rep_partners. The house is excluded even if a row somehow names it.
-- ---------------------------------------------------------------------------

create or replace function public.tenant_scope()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $tenant_scope$
  select t.id
    from public.tenants t
   where exists (
     select 1
       from public.profiles p
      where p.id = auth.uid()
        and p.deactivated_at is null
        and p.is_platform_staff
   )
  union all
  select rp.tenant_id
    from public.rep_partners rp
    join public.profiles p on p.id = rp.rep_id
    join public.tenants  t on t.id = rp.tenant_id
   where rp.rep_id = auth.uid()
     and p.deactivated_at is null
     and p.role = 'rep'
     and not t.is_house
  union all
  select p.tenant_id
    from public.profiles p
   where p.id = auth.uid()
     and p.deactivated_at is null
     and not p.is_platform_staff
     and p.role <> 'rep'
$tenant_scope$;

grant  execute on function public.tenant_scope() to authenticated;
revoke execute on function public.tenant_scope() from public, anon;

comment on function public.tenant_scope() is
  'Every tenant the caller may READ: every tenant for platform staff, the '
  'assigned partners for a sales rep (never the house), one row for anyone '
  'else, no rows for a stranger or a deactivated teammate. The chokepoint '
  'every SELECT policy depends on. Must stay STABLE.';


-- ---------------------------------------------------------------------------
-- 5. A rep reads its own team's roster and pipeline, not its leads
--
-- The session read (lib/auth/session.ts) selects the caller's profile through
-- RLS, and the console resolves owner names and stage labels from the home
-- tenant's profiles and lead_stages (lib/console/stages.server.ts). A rep's
-- home tenant is the house, which section 4 keeps out of its scope, so
-- without these clauses a rep could not sign in, and every badge would fall
-- back to a raw slug and every owner to an unknown name.
--
-- Both are reference data: the names of the rep's own colleagues and the
-- labels of the pipeline. Neither carries a lead. The house id comes from
-- house_tenant_id(), not current_tenant_id(), to keep 0009's rule that no
-- SELECT policy reads current_tenant_id().
-- ---------------------------------------------------------------------------

drop policy if exists "members read profiles in scope" on public.profiles;
create policy "members read profiles in scope"
  on public.profiles for select
  to authenticated
  using (
    tenant_id in (select public.tenant_scope())
    or id = auth.uid()
    or (public.is_rep() and tenant_id = public.house_tenant_id())
  );

drop policy if exists "reps read the house pipeline" on public.lead_stages;
create policy "reps read the house pipeline"
  on public.lead_stages for select
  to authenticated
  using (public.is_rep() and tenant_id = public.house_tenant_id());


-- ---------------------------------------------------------------------------
-- 6. Writes refuse reps
--
-- View-only is the agreed scope. The 0006 column grant still governs WHICH
-- columns staff may write; these predicates decide that a rep writes none.
--
-- The one write a rep keeps is the "opened" audit line: the sign-in page
-- tells every console user that each record they open is logged with their
-- name, and a rep is no exception.
-- ---------------------------------------------------------------------------

drop policy if exists "members update submissions in scope" on public.submissions;
create policy "members update submissions in scope"
  on public.submissions for update
  to authenticated
  using      (tenant_id in (select public.tenant_scope()) and not public.is_rep())
  with check (tenant_id in (select public.tenant_scope()) and not public.is_rep());

comment on policy "members update submissions in scope" on public.submissions is
  'Authorises the ROW (tenant isolation). Which COLUMNS may be written is a '
  'separate column grant, see migration 0006: RLS cannot express per-column '
  'rules. WITH CHECK repeats USING so a lead cannot be moved between tenants. '
  'Sales reps are view-only (0018).';

drop policy if exists "members write notes in scope" on public.submission_notes;
create policy "members write notes in scope"
  on public.submission_notes for insert
  to authenticated
  with check (
    tenant_id in (select public.tenant_scope())
    and author_id = auth.uid()
    and not public.is_rep()
  );

drop policy if exists "members write events in scope" on public.submission_events;
create policy "members write events in scope"
  on public.submission_events for insert
  to authenticated
  with check (
    tenant_id in (select public.tenant_scope())
    and (actor_id is null or actor_id = auth.uid())
    and (not public.is_rep() or (action = 'opened' and actor_id = auth.uid()))
  );


-- ---------------------------------------------------------------------------
-- 6b. A rep never owns a lead
--
-- 0009's assignee guard admits any profile on the lead's own tenant, and a
-- rep's tenant is the house, so a direct lead could otherwise be assigned to
-- one: a lead they cannot even read. A separate BEFORE trigger rather than a
-- rewrite of that guard; named 35_ so it fires after it (alphabetical order).
-- ---------------------------------------------------------------------------

create or replace function public.submissions_refuse_rep_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $submissions_refuse_rep_assignee$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end)
     and exists (
       select 1 from public.profiles where id = new.assigned_to and role = 'rep'
     )
  then
    raise exception 'Sales reps cannot own a lead.' using errcode = '42501';
  end if;
  return new;
end;
$submissions_refuse_rep_assignee$;

drop trigger if exists submissions_35_refuse_rep_assignee_trg on public.submissions;
create trigger submissions_35_refuse_rep_assignee_trg
  before insert or update of assigned_to on public.submissions
  for each row execute function public.submissions_refuse_rep_assignee();


-- ---------------------------------------------------------------------------
-- 7. is_house_member() excludes reps
--
-- It gates consent_records_select (0015) and record_sms_opt_out (0016).
-- Consent rows carry IP addresses and user agents, and recording an opt-out
-- is a write. Neither is part of a rep's view, so the exclusion lives in the
-- one function both read.
-- ---------------------------------------------------------------------------

create or replace function public.is_house_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_house_member$
  select exists (
    select 1
      from public.profiles p
      join public.tenants  t on t.id = p.tenant_id
     where p.id = auth.uid()
       and p.deactivated_at is null
       and p.role <> 'rep'
       and t.is_house
  );
$is_house_member$;

grant  execute on function public.is_house_member() to authenticated;
revoke execute on function public.is_house_member() from public, anon;


-- ---------------------------------------------------------------------------
-- 8a. handle_new_user: a rep invite makes a rep, never platform staff
--
-- 'rep' is honoured only on the house tenant. A partner admin's invite
-- metadata claiming 'rep' falls back to member, as any unknown role does.
-- The staff flag stays derived (0009 section 8) and is forced false for a
-- rep, which section 1's check would refuse anyway.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $handle_new_user$
declare
  v_tenant    uuid := '00000000-0000-4000-8000-000000000001';
  v_role      text := 'member';
  v_claimed   text;
  v_platform  boolean := false;
begin
  if new.invited_at is null then
    return new;
  end if;

  v_claimed := new.raw_user_meta_data ->> 'role';
  v_role := case when v_claimed in ('admin', 'member', 'rep') then v_claimed else 'member' end;

  v_claimed := new.raw_user_meta_data ->> 'tenant_id';
  if v_claimed is not null and exists (
    select 1 from public.tenants where id = v_claimed::uuid
  ) then
    v_tenant := v_claimed::uuid;
  end if;

  if v_role = 'rep' and v_tenant <> '00000000-0000-4000-8000-000000000001' then
    v_role := 'member';
  end if;

  /*
    Derived, never claimed. raw_user_meta_data is attacker-influenced on the
    self-signup path and partner-admin-influenced on the invite path, so
    reading is_platform_staff from it would be a privilege escalation.
  */
  v_platform := v_role <> 'rep'
    and v_tenant = '00000000-0000-4000-8000-000000000001'
    and exists (
      select 1
        from public.profiles inviter
       where inviter.id = (new.raw_user_meta_data ->> 'invited_by')::uuid
         and inviter.is_platform_staff
         and inviter.deactivated_at is null
    );

  insert into public.profiles
    (id, tenant_id, full_name, role, email, is_platform_staff)
  values (
    new.id,
    v_tenant,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    new.email,
    v_platform
  )
  on conflict (id) do nothing;

  return new;

exception
  when invalid_text_representation then
    -- A malformed uuid in tenant_id or invited_by. Still an invited account,
    -- so it gets a profile: default tenant, member, never platform staff.
    insert into public.profiles
      (id, tenant_id, full_name, role, email, is_platform_staff)
    values (
      new.id,
      '00000000-0000-4000-8000-000000000001',
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      'member',
      new.email,
      false
    )
    on conflict (id) do nothing;
    return new;
end;
$handle_new_user$;


-- ---------------------------------------------------------------------------
-- 8b. set_teammate_role learns 'rep'
--
-- Three changes from 0006:
--
--   * The last-admin guard fires on any move away from admin, not only on
--     the literal 'member'. With a third role, "= 'member'" would have let
--     the last admin be turned into a rep.
--   * The staff flag follows the role on the house tenant: a rep is never
--     staff, and a rep promoted to member or admin becomes staff, which is
--     what every other house teammate is.
--   * Becoming a rep releases the person's assigned leads (they no longer
--     work leads here), and leaving the role drops their partner assignments.
--
-- 'rep' is refused outside the house tenant: a partner admin can call this
-- RPC for their own team, and a partner-tenant rep would be meaningless.
-- ---------------------------------------------------------------------------

create or replace function public.set_teammate_role(
  p_profile_id uuid,
  p_role       text
)
returns void
language plpgsql
security definer
set search_path = public
as $set_teammate_role$
declare
  v_uid      uuid := auth.uid();
  v_tenant   uuid := public.current_tenant_id();
  v_admins   integer;
  v_was      text;
  v_is_house boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles.' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member', 'rep') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;

  if p_profile_id = v_uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  select is_house into v_is_house from public.tenants where id = v_tenant;
  if p_role = 'rep' and not coalesce(v_is_house, false) then
    raise exception 'Sales reps belong to the Prime PEO Brokers team.' using errcode = '42501';
  end if;

  perform public.lock_tenant_team(v_tenant);

  select role into v_was
    from public.profiles
   where id = p_profile_id
     and tenant_id = v_tenant
     and deactivated_at is null;

  if v_was is null then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  if v_was = p_role then
    return;
  end if;

  -- Counted under the advisory lock, so a concurrent removal cannot change
  -- the answer between the count and the update.
  if v_was = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins
      from public.profiles
     where tenant_id = v_tenant
       and role = 'admin'
       and deactivated_at is null;

    if v_admins <= 1 then
      raise exception 'That is the only admin on the team. Promote someone else first.'
        using errcode = '42501';
    end if;
  end if;

  -- Before the role flips, so the 0005 update trigger logs each release
  -- while the profile still resolves as an active teammate.
  if p_role = 'rep' then
    update public.submissions
       set assigned_to = null
     where assigned_to = p_profile_id;
  end if;

  update public.profiles
     set role = p_role,
         is_platform_staff = case
           when p_role = 'rep' then false
           when v_was = 'rep' and coalesce(v_is_house, false) then true
           else is_platform_staff
         end
   where id = p_profile_id
     and tenant_id = v_tenant;

  if v_was = 'rep' then
    delete from public.rep_partners where rep_id = p_profile_id;
  end if;

  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  select
    v_tenant, v_uid, coalesce(a.full_name, a.email, 'staff'), 'role_changed',
    format('%s is now %s',
           coalesce(t.full_name, t.email, 'a teammate'),
           case p_role when 'rep' then 'a sales rep' when 'admin' then 'an admin' else 'a member' end)
    from public.profiles a, public.profiles t
   where a.id = v_uid and t.id = p_profile_id;
end;
$set_teammate_role$;

grant  execute on function public.set_teammate_role(uuid, text) to authenticated;
revoke execute on function public.set_teammate_role(uuid, text) from public, anon;


-- ---------------------------------------------------------------------------
-- 8c. remove_teammate keeps a rep a rep
--
-- 0009's version resets role to 'member' on removal. For a rep that would
-- make Restore bring back a non-staff member whose scope is the house tenant,
-- which is every direct lead. Everything else is 0009's body unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.remove_teammate(
  p_profile_id   uuid,
  p_reassign_to  uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $remove_teammate$
declare
  v_uid       uuid := auth.uid();
  v_tenant    uuid := public.current_tenant_id();
  v_admins    integer;
  v_moved     integer;
  v_name      text;
  v_platform  boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove teammates.' using errcode = '42501';
  end if;

  perform public.lock_tenant_team(v_tenant);

  select coalesce(full_name, email, 'a teammate'), is_platform_staff
    into v_name, v_platform
    from public.profiles
   where id = p_profile_id
     and tenant_id = v_tenant
     and deactivated_at is null;

  if v_name is null then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  select count(*) into v_admins
    from public.profiles
   where tenant_id = v_tenant
     and role = 'admin'
     and deactivated_at is null;

  if v_admins <= 1 and exists (
    select 1 from public.profiles
     where id = p_profile_id
       and tenant_id = v_tenant
       and role = 'admin'
  ) then
    raise exception 'That is the only admin on the team. Promote someone else first.'
      using errcode = '42501';
  end if;

  if p_reassign_to is not null and not exists (
    select 1 from public.profiles
     where id = p_reassign_to
       and tenant_id = v_tenant
       and deactivated_at is null
       and id <> p_profile_id
       and role <> 'rep'
  ) then
    raise exception 'Cannot reassign to that teammate.' using errcode = 'P0002';
  end if;

  update public.submissions
     set assigned_to = case
           when tenant_id = v_tenant then p_reassign_to
           when p_reassign_to is not null and exists (
             select 1 from public.profiles r
              where r.id = p_reassign_to
                and r.is_platform_staff
                and r.deactivated_at is null
           ) then p_reassign_to
           else null
         end
   where assigned_to = p_profile_id
     and (tenant_id = v_tenant or coalesce(v_platform, false));
  get diagnostics v_moved = row_count;

  update public.profiles
     set deactivated_at = now(),
         deactivated_by = v_uid,
         role           = case when role = 'rep' then 'rep' else 'member' end
   where id = p_profile_id;

  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  select
    v_tenant, v_uid, coalesce(a.full_name, a.email, 'staff'), 'removed',
    case
      when v_moved = 0 then format('%s removed from the team', v_name)
      else format('%s removed from the team, %s lead(s) reassigned', v_name, v_moved)
    end
    from public.profiles a
   where a.id = v_uid;

  return v_moved;
end;
$remove_teammate$;

grant  execute on function public.remove_teammate(uuid, uuid) to authenticated;
revoke execute on function public.remove_teammate(uuid, uuid) from public, anon;


-- ---------------------------------------------------------------------------
-- 9. set_partner_reps: the only writer of rep_partners
--
-- Replaces a partner's rep set in one call, so the Partners screen saves a
-- checklist rather than issuing add/remove pairs that could half-apply.
-- Staff AND admin: assigning reps decides who sees which leads, which is the
-- admin's call. Logged on the house tenant, like every partner-admin RPC.
-- ---------------------------------------------------------------------------

create or replace function public.set_partner_reps(
  p_tenant_id uuid,
  p_rep_ids   uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $set_partner_reps$
declare
  v_uid     uuid := public.require_platform_staff();
  v_house   uuid;
  v_partner text;
  v_ids     uuid[] := coalesce(p_rep_ids, '{}');
  v_names   text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign reps.' using errcode = '42501';
  end if;

  select id into v_house from public.tenants where is_house;

  select name into v_partner
    from public.tenants
   where id = p_tenant_id
     and not is_house;
  if v_partner is null then
    raise exception 'That partner does not exist.' using errcode = 'P0002';
  end if;

  perform public.lock_tenant_team(p_tenant_id);

  if exists (
    select 1
      from unnest(v_ids) as r(id)
     where not exists (
       select 1 from public.profiles p
        where p.id = r.id
          and p.tenant_id = v_house
          and p.role = 'rep'
          and p.deactivated_at is null
     )
  ) then
    raise exception 'One of those people is not an active sales rep.' using errcode = '22023';
  end if;

  delete from public.rep_partners
   where tenant_id = p_tenant_id
     and not (rep_id = any (v_ids));

  insert into public.rep_partners (rep_id, tenant_id, assigned_by)
  select distinct r.id, p_tenant_id, v_uid
    from unnest(v_ids) as r(id)
  on conflict (rep_id, tenant_id) do nothing;

  select string_agg(coalesce(p.full_name, p.email), ', ' order by coalesce(p.full_name, p.email))
    into v_names
    from public.rep_partners rp
    join public.profiles p on p.id = rp.rep_id
   where rp.tenant_id = p_tenant_id;

  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  select
    v_house, v_uid, coalesce(a.full_name, a.email, 'staff'), 'reps_assigned',
    format('Reps for %s: %s', v_partner, coalesce(v_names, 'none'))
    from public.profiles a
   where a.id = v_uid;
end;
$set_partner_reps$;

grant  execute on function public.set_partner_reps(uuid, uuid[]) to authenticated;
revoke execute on function public.set_partner_reps(uuid, uuid[]) from public, anon;


-- ---------------------------------------------------------------------------
-- 10. Assert the end state
-- ---------------------------------------------------------------------------

do $assert_0018$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_role_check'
       and pg_get_constraintdef(oid) ilike '%rep%'
  ) then
    raise exception '0018: profiles_role_check does not allow rep';
  end if;

  if (
    select count(*) from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%role%'
       and pg_get_constraintdef(oid) ilike '%member%'
  ) <> 1 then
    raise exception '0018: expected exactly one role check on profiles';
  end if;

  if position('rep_partners' in pg_get_functiondef('public.tenant_scope()'::regprocedure)) = 0 then
    raise exception '0018: tenant_scope() has no rep branch';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.rep_partners'::regclass) then
    raise exception '0018: RLS is off on rep_partners';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'rep_partners'
       and (cmd <> 'SELECT' or 'anon' = any (roles) or 'public' = any (roles))
  ) then
    raise exception '0018: rep_partners has a write or anon policy';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and (tablename, policyname) in (
         ('submissions',       'members update submissions in scope'),
         ('submission_notes',  'members write notes in scope'),
         ('submission_events', 'members write events in scope')
       )
       and coalesce(qual, '') || coalesce(with_check, '') not ilike '%is_rep%'
  ) then
    raise exception '0018: a write policy does not exclude reps';
  end if;

  if position('''rep''' in pg_get_functiondef('public.is_house_member()'::regprocedure)) = 0 then
    raise exception '0018: is_house_member() does not exclude reps';
  end if;
end;
$assert_0018$;
