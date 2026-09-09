-- ===========================================================================
-- 0009 · Phase 3 foundation: cross-tenant visibility
--
-- WHAT THIS CHANGES
--
-- The read boundary moves from "your tenant" to "every tenant in your scope".
-- Partners stay fully isolated tenants; Prime PEO Brokers' own staff read
-- across all of them, which is the SOW requirement: "each broker partner gets
-- a branded portal showing only their own leads, while the client retains
-- visibility across every partner."
--
-- WHY NOT JUST EDIT THE CHOKEPOINT
--
-- Every policy funnels through current_tenant_id(), so widening that one
-- function looks like the whole job. It is not possible:
--
--   * `create or replace function` refuses to change a return type outright:
--     "cannot change return type of existing function". A uuid cannot become
--     a setof uuid in place.
--   * `drop function ... cascade` would drop all thirteen dependent policies.
--     RLS would stay ENABLED with zero policies, which denies every row to
--     `authenticated` silently. That presents as "all the data is gone", not
--     as an error, and it is the worst failure mode available here.
--   * Even given a set-returning function, `tenant_id = f()` is rejected:
--     set-returning functions are not allowed at the top level of a policy
--     expression.
--
-- So: add a NEW function, keep current_tenant_id() exactly as it is, and
-- rewrite the thirteen policies explicitly. current_tenant_id() keeps its
-- signature and body, so all nine RPC call sites and lib/auth/session.ts are
-- untouched. Its MEANING narrows to "your home tenant, the one you
-- administer", which is re-commented below.
--
-- WHY `in (select ...)` AND NOT `or is_platform_staff()`
--
-- `tenant_id = current_tenant_id() or is_platform_staff()` is the smaller
-- diff and the wrong answer. A disjunction with a bare function call in one
-- arm is not an indexable predicate: the planner cannot prove it reduces to a
-- restriction on tenant_id, so every console query degrades to a sequential
-- scan on submissions, for partners as well as staff. `tenant_id in (select
-- tenant_scope())` stays a tenant_id restriction and keeps every index in
-- 0005 section 7 usable.
--
-- ROLLBACK
--
-- current_tenant_id() is never dropped and never changes signature, so
-- reverting is the thirteen `create policy` statements back to
-- `= current_tenant_id()`. is_platform_staff can be left in place; it is
-- inert without the policies. No data is destroyed anywhere in this file, and
-- there is no drop function, drop constraint or column type change.
--
-- ORDER IS LOAD-BEARING. The column must exist before a function body
-- referencing it is parsed (0005 section 1 hit exactly this), and the
-- policies come last so a failure in any earlier step aborts before the read
-- boundary has been touched.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Platform staff
--
-- A column on profiles, not a third `role` value. role already means
-- "administers this tenant": is_admin() gates team management and the stage
-- editor, and a partner tenant needs its own admins. Conflating "administers
-- a tenant" with "sees every tenant" would make the first partner admin
-- omniscient the moment they were promoted.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_platform_staff boolean not null default false;

comment on column public.profiles.is_platform_staff is
  'True only for Prime PEO Brokers'' own team. Widens tenant_scope() to every '
  'tenant. Orthogonal to role, which scopes administration WITHIN a tenant. '
  'Not settable through the console: it is outside the (full_name) column '
  'grant, and handle_new_user derives it rather than reading it from invite '
  'metadata. See migration 0009.';

/*
  0005 section 1 revoked UPDATE on profiles and re-granted only (full_name),
  so that a future `using (id = auth.uid())` update policy could not let a
  member set their own role. Restated here so the new flag is provably outside
  the grant even if a later migration re-grants UPDATE by mistake.
*/
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Seed: the founding tenant's active team IS the client's staff
--
-- The alternative is shipping a Phase 3 where nobody is platform staff until
-- someone runs SQL by hand, i.e. where the client cannot see partner leads.
-- Idempotent via the `= false` predicate.
-- ---------------------------------------------------------------------------

update public.profiles
   set is_platform_staff = true
 where tenant_id = '00000000-0000-4000-8000-000000000001'
   and is_platform_staff = false;


-- ---------------------------------------------------------------------------
-- 3. The flag and the tenant can never disagree
--
-- A platform staff profile sitting on a partner tenant would be a
-- contradiction: tenant_scope() would return every tenant for someone whose
-- home tenant is a partner. Enforced structurally rather than by convention.
--
-- `not valid` then `validate` as two statements: validate takes only
-- SHARE UPDATE EXCLUSIVE and does not block reads. profiles is tiny today so
-- it is instant either way; this is the habit the rest of the schema keeps.
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_platform_staff_home_chk;

alter table public.profiles
  add constraint profiles_platform_staff_home_chk
  check (not is_platform_staff
         or tenant_id = '00000000-0000-4000-8000-000000000001')
  not valid;

alter table public.profiles
  validate constraint profiles_platform_staff_home_chk;


-- ---------------------------------------------------------------------------
-- 4. tenant_scope(): the new read chokepoint
--
-- Returns every tenant the caller may read: one row for a partner, every
-- tenant for platform staff, ZERO rows for a stranger or a deactivated
-- teammate. Zero rows makes `tenant_id in (select ...)` false, so every
-- policy denies. That is 0007's revocation-on-next-request property, and the
-- `deactivated_at is null` filter below is what preserves it.
--
-- `stable` IS THE MOST IMPORTANT WORD IN THIS FILE. Policies are evaluated
-- per row. A stable zero-argument function is uncorrelated, so Postgres
-- hoists it into a hashed InitPlan and executes it ONCE per query, then hash
-- probes per row. Drop the keyword and it defaults to volatile, which cannot
-- be hoisted: it would execute once per row, i.e. 100k times on a 100k-row
-- scan. Nothing breaks, no test fails, the console just gets slow as data
-- arrives. Verify with `explain (analyze)`: expect `InitPlan 1`, a `hashed
-- SubPlan`, and loops=1 on the function node.
--
-- `security definer` for the reason 0001 and 0005 section 2 give: a function
-- reading public.profiles, called from a policy ON public.profiles, would
-- recurse through that policy. It also lets the staff branch read
-- public.tenants, which the caller's own policy restricts to rows in scope.
--
-- `union all`, not `union`: the two branches are mutually exclusive by the
-- `not p.is_platform_staff` predicate, so there is nothing to deduplicate and
-- no reason to pay for a sort.
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
  select p.tenant_id
    from public.profiles p
   where p.id = auth.uid()
     and p.deactivated_at is null
     and not p.is_platform_staff
$tenant_scope$;

/*
  The EXECUTE grant is load-bearing and is NOT implied by security definer.
  0005 section 0 states the rule: USING and WITH CHECK are evaluated with the
  privileges of the QUERYING role, so `authenticated` needs EXECUTE in its own
  right. security definer governs what the body may do once entered; it does
  not grant the right to enter. Explicit grant AND explicit revoke, because
  Supabase's `alter default privileges` fires at CREATE time and would
  otherwise silently re-grant anon on a future drop/create.
*/
grant  execute on function public.tenant_scope() to authenticated;
revoke execute on function public.tenant_scope() from public, anon;

comment on function public.tenant_scope() is
  'Every tenant the caller may READ: one row for a partner, every tenant for '
  'platform staff, no rows for a stranger or a deactivated teammate. The '
  'chokepoint every SELECT policy depends on. Must stay STABLE or it is '
  'evaluated once per row instead of once per query. See migration 0009.';


-- ---------------------------------------------------------------------------
-- 5. current_tenant_id() keeps its body and narrows its meaning
--
-- No functional change. The comment is the change: this is now the HOME
-- tenant, used for writes that must land in one specific tenant (stage edits,
-- team events) and by the nine RPCs that already call it. It is deliberately
-- NOT the read boundary any more.
-- ---------------------------------------------------------------------------

comment on function public.current_tenant_id() is
  'The caller''s HOME tenant: the one they administer, and the one their '
  'writes default to. As of 0009 this is NO LONGER the read boundary; reads '
  'go through tenant_scope(), which returns every tenant for platform staff. '
  'Do not reintroduce this into a SELECT policy. The deactivation filter here '
  'is what revokes a removed teammate (0007).';


-- ---------------------------------------------------------------------------
-- 6. assigned_to must name someone who could legitimately own the lead
--
-- THE HOLE THIS CLOSES, AND WHY IT OPENS IN THIS MIGRATION
--
-- 0005 section 4 added `assigned_to uuid references public.profiles (id)`: a
-- SINGLE-column FK with no tenant pinning. 0006 section 4 gave
-- submission_notes and submission_events composite (tenant_id, submission_id)
-- FKs, and 0005 gave lead_stage a composite (tenant_id, slug) FK, but
-- assigned_to never got the equivalent.
--
-- Today that is latent, and app/console/leads/[id]/actions.ts says why in a
-- comment: "RLS already scopes profiles to the caller's tenant, so a
-- cross-tenant id simply returns no row."
--
-- SECTION 9 BELOW MAKES THAT COMMENT FALSE. Widening the profiles SELECT
-- policy is what turns an unreachable FK gap into a reachable one.
--
-- The leak is partner-to-partner and it is PERMANENT once it happens:
-- submissions_log_changes() writes the assignee's full_name into
-- submission_events.detail, which is append-only with no update or delete
-- policy by design (0005 section 5). There is no cleanup path, so this has to
-- be impossible rather than detectable.
--
-- A composite FK cannot express the rule, because the legitimate set depends
-- on the lead's own tenant_id: an assignee is valid if they are in the lead's
-- tenant OR they are platform staff. That second clause is the SOW
-- requirement ("the client's team performs the actual work on each lead"), so
-- a guard that only enforced same-tenant would break the product.
-- ---------------------------------------------------------------------------

create or replace function public.submissions_guard_assignee()
returns trigger
language plpgsql
security definer            -- reads profiles across tenants; the caller's own
set search_path = public    -- profiles policy must not narrow this check
as $guard_assignee$
declare
  v_ok boolean;
begin
  -- Every discovery insert takes this branch, so the revenue path pays one
  -- null test and nothing else.
  if new.assigned_to is null then
    return new;
  end if;

  /*
    Skip when nothing relevant changed, so a stage-only edit or the
    touch_updated_at path never pays for a profiles lookup.

    `is not distinct from` rather than `=` for the reason 0005 section 6
    gives: `=` yields NULL, not false, when either side is null, and the first
    assignment of a lead is exactly that case.
  */
  if tg_op = 'UPDATE'
     and new.assigned_to is not distinct from old.assigned_to
     and new.tenant_id   is not distinct from old.tenant_id then
    return new;
  end if;

  select (p.tenant_id = new.tenant_id or p.is_platform_staff)
         and p.deactivated_at is null
    into v_ok
    from public.profiles p
   where p.id = new.assigned_to;

  -- coalesce: a missing profile row leaves v_ok null, which must deny.
  if not coalesce(v_ok, false) then
    raise exception 'That teammate cannot own this lead.'
      using errcode = '42501',
            detail  = format(
              'assigned_to %s is neither in tenant %s nor platform staff, or is deactivated.',
              new.assigned_to, new.tenant_id);
  end if;

  return new;
end;
$guard_assignee$;

comment on function public.submissions_guard_assignee() is
  'Pins assigned_to to a profile that could legitimately own the lead: same '
  'tenant, or platform staff. Closes the partner-to-partner leak that '
  'widening the profiles SELECT policy would otherwise open, and which lands '
  'in append-only submission_events with no cleanup path. See migration 0009.';

/*
  BEFORE, and named 30_ so it sorts after the 0005 triggers: Postgres fires
  BEFORE row triggers in alphabetical order, and 0005 relies on that for its
  10_/20_ prefixes. This one must run after any trigger that could resolve
  tenant_id.
*/
do $assignee_trg$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'submissions_30_guard_assignee_trg'
       and tgrelid = 'public.submissions'::regclass
  ) then
    create trigger submissions_30_guard_assignee_trg
      before insert or update of assigned_to, tenant_id on public.submissions
      for each row execute function public.submissions_guard_assignee();
  end if;
end $assignee_trg$;


-- ---------------------------------------------------------------------------
-- 7. remove_teammate releases a platform staff member's leads in EVERY tenant
--
-- 0007's version scopes the release to `where tenant_id = v_tenant`, which
-- was right when every profile could only ever own leads in its own tenant.
-- A platform staff member can now be assigned a lead in ANY tenant (section
-- 6 permits it, and the SOW requires it), so scoping the release to their
-- home tenant would leave partner-tenant leads owned by someone who can no
-- longer sign in. That is precisely the state 0005's "release their leads
-- first" exists to prevent.
--
-- Everything else in this function is byte-for-byte 0007's version. Only the
-- one UPDATE's WHERE clause changes.
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
  ) then
    raise exception 'Cannot reassign to that teammate.' using errcode = 'P0002';
  end if;

  /*
    Release their leads first, so the 0005 update trigger logs each move while
    the profile is still active and its name still resolves.

    THE 0009 CHANGE: a platform staff member's leads are not confined to their
    home tenant, so the release must span every tenant for them. A partner's
    leads still cannot leave their own tenant, because a partner profile can
    only ever be assigned within it (section 6).

    p_reassign_to is validated above as a live member of v_tenant. Handing a
    partner-tenant lead to them would violate section 6's guard, so for a
    platform staff member the reassign target must itself be platform staff;
    otherwise their out-of-tenant leads are released to nobody (null), which
    is the safe outcome and matches "assigned to nobody" rather than failing
    the whole removal.
  */
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
         role           = 'member'
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


-- ---------------------------------------------------------------------------
-- 8. handle_new_user DERIVES is_platform_staff. It never reads it.
--
-- 0007's argument applies here with more force. invited_at proves an
-- administrator created the account, but in Phase 3 a PARTNER admin can
-- legitimately send invites, and their invite metadata must not be able to
-- mint an account that reads every tenant.
--
-- So the flag is derived from two facts the invitee cannot influence: the
-- inviter is platform staff, AND the resolved tenant is the founding tenant.
-- The second clause means even a platform staff inviter cannot create a
-- platform-staff account inside a partner tenant, so the flag and the tenant
-- can never disagree (section 3 enforces the same invariant structurally).
--
-- Requires app/console/team/actions.ts to pass invited_by in the invite
-- metadata. If it is absent the exists() is false and the account is an
-- ordinary member, which is the safe default.
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
  v_role := case when v_claimed in ('admin', 'member') then v_claimed else 'member' end;

  v_claimed := new.raw_user_meta_data ->> 'tenant_id';
  if v_claimed is not null and exists (
    select 1 from public.tenants where id = v_claimed::uuid
  ) then
    v_tenant := v_claimed::uuid;
  end if;

  /*
    Derived, never claimed. raw_user_meta_data is attacker-influenced on the
    self-signup path and partner-admin-influenced on the invite path, so
    reading is_platform_staff from it would be a privilege escalation.
  */
  v_platform := v_tenant = '00000000-0000-4000-8000-000000000001'
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

comment on function public.handle_new_user() is
  'Creates a tenant profile for INVITED accounts only. A self-signup gets an '
  'auth user with no profile, so tenant_scope() is empty and every RLS policy '
  'denies. is_platform_staff is DERIVED from the inviter, never read from '
  'invite metadata. See migrations 0007 and 0009.';


-- ===========================================================================
-- 9. The policies
--
-- `drop policy if exists` + `create policy`, NOT the anonymous-block
-- "if not exists" guard 0005 used. These policies already exist, so that
-- guard would skip every one of them and leave the old single-tenant
-- expression in place: a migration that reports success and changes nothing.
--
-- (That guard is not named with its dollar-quote delimiter here on purpose.
-- A bare pair of dollar signs inside a COMMENT still looks like a quote
-- opener to a client that splits a script on statement boundaries by
-- counting them, which desynchronises its parser and shreds the block at the
-- end of this file. The Supabase dashboard's SQL editor does exactly that.)
--
-- READS widen to tenant_scope(). WRITES widen only where the SOW requires it.
-- The asymmetry is deliberate and is spelled out per table below.
-- ===========================================================================

-- --- tenants ---------------------------------------------------------------
-- Staff read every tenant (a partner switcher needs the list); a partner
-- reads only its own row.
drop policy if exists "members read their tenant" on public.tenants;
create policy "members read tenants in scope"
  on public.tenants for select
  to authenticated
  using (id in (select public.tenant_scope()));

-- --- profiles --------------------------------------------------------------
/*
  The asymmetry here is the point: staff must see partner profiles to render
  "assigned to" and note authorship on a partner lead, but a partner must
  never see the client's roster. tenant_scope() delivers exactly that, because
  a partner's scope is one tenant.

  This is also the policy that makes section 6's guard necessary. Before this
  change, a cross-tenant profile id "simply returned no row" for everyone.
*/
drop policy if exists "members read profiles in their tenant" on public.profiles;
create policy "members read profiles in scope"
  on public.profiles for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

-- --- submissions -----------------------------------------------------------
drop policy if exists "members read their tenant's submissions" on public.submissions;
create policy "members read submissions in scope"
  on public.submissions for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

/*
  UPDATE widens: "every partner submission also routed to the client, since
  the client's team performs the actual work on each lead."

  WITH CHECK repeats USING so a lead cannot be MOVED between tenants. Without
  it an UPDATE could rewrite tenant_id to any tenant in scope, which for
  platform staff is every tenant. tenant_id is not in the 0006 column grant
  either, so this is defence in depth rather than the only guard.
*/
drop policy if exists "members update their tenant's submissions" on public.submissions;
create policy "members update submissions in scope"
  on public.submissions for update
  to authenticated
  using      (tenant_id in (select public.tenant_scope()))
  with check (tenant_id in (select public.tenant_scope()));

comment on policy "members update submissions in scope" on public.submissions is
  'Authorises the ROW (tenant isolation). Which COLUMNS may be written is a '
  'separate column grant, see migration 0006: RLS cannot express per-column '
  'rules. WITH CHECK repeats USING so a lead cannot be moved between tenants.';

-- --- submission_events -----------------------------------------------------
drop policy if exists "members read their tenant's events" on public.submission_events;
create policy "members read events in scope"
  on public.submission_events for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

-- Attribution stays pinned to the caller exactly as 0005 pinned it.
drop policy if exists "members write events in their tenant" on public.submission_events;
create policy "members write events in scope"
  on public.submission_events for insert
  to authenticated
  with check (
    tenant_id in (select public.tenant_scope())
    and (actor_id is null or actor_id = auth.uid())
  );

-- --- submission_notes ------------------------------------------------------
drop policy if exists "members read their tenant's notes" on public.submission_notes;
create policy "members read notes in scope"
  on public.submission_notes for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

/*
  Staff write notes on partner leads (they do the work). author_id stays
  pinned to auth.uid(), and 0006's composite (tenant_id, submission_id) FK
  still prevents attaching a note to another tenant's submission, so widening
  the tenant predicate cannot be used to stitch across tenants.
*/
drop policy if exists "members write notes in their tenant" on public.submission_notes;
create policy "members write notes in scope"
  on public.submission_notes for insert
  to authenticated
  with check (
    tenant_id in (select public.tenant_scope())
    and author_id = auth.uid()
  );

-- --- lead_stages -----------------------------------------------------------
drop policy if exists "members read their tenant's stages" on public.lead_stages;
create policy "members read stages in scope"
  on public.lead_stages for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

/*
  WRITES DO NOT WIDEN. A pipeline is a tenant's own configuration. A staff
  member editing a partner's stages could retire the stage that partner's
  leads sit on, and lead_stages_guard's invariants are all keyed on
  new.tenant_id rather than on the caller. These stay on current_tenant_id(),
  which is exactly the "home tenant" contract section 5 gave it.
*/
drop policy if exists "admins add stages in their tenant" on public.lead_stages;
create policy "admins add stages in their home tenant"
  on public.lead_stages for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists "admins edit stages in their tenant" on public.lead_stages;
create policy "admins edit stages in their home tenant"
  on public.lead_stages for update
  to authenticated
  using      (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- --- tenant_events ---------------------------------------------------------
-- Staff read every tenant's team log: they support partners and need to be
-- able to answer "who removed whom".
drop policy if exists "members read their tenant's team events" on public.tenant_events;
create policy "members read team events in scope"
  on public.tenant_events for select
  to authenticated
  using (tenant_id in (select public.tenant_scope()));

-- Writes stay home-tenant only, for the same reason as lead_stages: a
-- partner's team log is the partner's.
drop policy if exists "admins write team events in their tenant" on public.tenant_events;
create policy "admins write team events in their home tenant"
  on public.tenant_events for insert
  to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and actor_id = auth.uid()
  );


-- ===========================================================================
-- 10. Indexes for the cross-tenant query shapes
--
-- Every index from 0005 section 7 leads with tenant_id and stays usable: for
-- a partner the predicate is still one value, and for staff the planner does
-- N range scans or a bitmap scan. Both use the index.
--
-- What no tenant_id-leading index can serve is a GLOBAL ordering. Staff now
-- sort across tenants (app/console/page.tsx orders by created_at desc and
-- paginates), and as the tenant count grows the planner will abandon the
-- composite index for a full scan plus sort. These two cover that.
--
-- Deliberately NOT added: an index on profiles (is_platform_staff). It is
-- only ever read through tenant_scope(), which locates the row by primary key
-- (p.id = auth.uid()); the flag is a column fetch off an already-found row.
-- ===========================================================================

create index if not exists submissions_created_idx
  on public.submissions (created_at desc);

create index if not exists submissions_assigned_created_idx
  on public.submissions (assigned_to, created_at desc)
  where assigned_to is not null;


-- ===========================================================================
-- 11. Assert the end state
--
-- The real risk in this migration is a MISSED policy. A read policy left on
-- current_tenant_id() means staff cannot see that table's partner rows, which
-- presents as a confusing empty panel rather than an error: exactly the class
-- of bug the scripts/check-*.mts guards exist to catch. So fail the deploy
-- instead of shipping a half-widened schema.
-- ===========================================================================

do $assert_end$
declare
  v_stale text;
  v_naked text;
begin
  -- No SELECT policy may still read the home tenant.
  select string_agg(format('%s.%s', tablename, policyname), ', ')
    into v_stale
    from pg_policies
   where schemaname = 'public'
     and cmd in ('SELECT', 'ALL')
     and coalesce(qual, '') like '%current_tenant_id%';

  if v_stale is not null then
    raise exception
      'These SELECT policies still read the home tenant: %. Widen them to tenant_scope() or the client cannot see partner leads.',
      v_stale;
  end if;

  /*
    Every TENANT-SCOPED table must still have at least one policy. RLS enabled
    with zero policies denies every row to authenticated SILENTLY, which is
    the drop-cascade failure mode this file's header warns about.

    Named explicitly rather than swept from pg_class, because "RLS on, no
    policies" is not always a bug: 0003 gives password_reset_attempts and
    request_throttle exactly that shape ON PURPOSE, with grants revoked from
    anon and authenticated so only the service-role client (which bypasses
    RLS) can reach them. Its comment says so: "The absence of policies below
    is deliberate, not an omission." A blanket sweep flags those two and fails
    a migration that is entirely correct, which is what happened on the first
    run of this file.
  */
  select string_agg(t.name, ', ')
    into v_naked
    from (values
      ('tenants'), ('profiles'), ('submissions'), ('submission_events'),
      ('lead_stages'), ('submission_notes'), ('tenant_events')
    ) as t(name)
    join pg_class c on c.relname = t.name
     and c.relnamespace = 'public'::regnamespace
   where c.relrowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = t.name
     );

  if v_naked is not null then
    raise exception
      'RLS is enabled with NO policies on: %. Every row would be denied silently.',
      v_naked;
  end if;

  -- tenant_scope must be STABLE. Volatile would evaluate it per row.
  if not exists (
    select 1 from pg_proc
     where proname = 'tenant_scope'
       and pronamespace = 'public'::regnamespace
       and provolatile = 's'
  ) then
    raise exception
      'tenant_scope() is not STABLE. It would be evaluated once per row instead of once per query.';
  end if;

  -- anon must never reach it, and must have no policy anywhere.
  if has_function_privilege('anon', 'public.tenant_scope()', 'execute') then
    raise exception 'anon can execute tenant_scope(). Revoke it.';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and 'anon' = any (roles)
  ) then
    raise exception 'A policy targets anon. Phase 1 through 3 grant anon nothing.';
  end if;
end $assert_end$;
