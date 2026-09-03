-- Prime PEO Brokers · authorize lead writes and close the team-lockout gap
--
-- Follow-up to 0005, from a review of it. Four problems, two of them serious
-- enough that the team and pipeline screens should not ship before this runs.
--
--   1. submissions had a tenant-scoped but otherwise unrestricted UPDATE
--      policy (from 0001), so any authenticated member could rewrite ANY
--      column of ANY lead in their tenant, including in bulk.
--   2. set_teammate_role had no last-admin guard, so two admins could demote
--      each other to zero admins and lock the tenant out permanently.
--   3. Both team RPCs read the admin count without locking, so concurrent
--      calls could each see "2 admins" and both proceed.
--   4. submission_notes.tenant_id was never tied to the note's submission, so
--      a row could attach to another tenant's lead.
--
-- Written to be safely re-runnable.


-- ===========================================================================
-- 1. Restrict what a member may change on a submission
--
-- 0001's policy is `using (tenant_id = current_tenant_id())` with no column
-- list, and RLS has no per-column granularity. So the policy authorises the
-- ROW but says nothing about which columns, and a member holding the anon key
-- plus their own session could:
--
--     PATCH /rest/v1/submissions?tenant_id=eq.<t>  {"lead_stage":"closed"}
--
-- closing every lead in the tenant in one request, or rewrite answers, ref,
-- resume_token, company_name, or benefits_spend on any record.
--
-- Column privileges are the right tool: they are checked independently of
-- RLS, so the policy keeps enforcing tenant isolation while the grant decides
-- which columns are writable at all. The same pattern 0005 already applied to
-- profiles.
--
-- Everything the discovery flow writes (answers, the denormalised projections,
-- resume_email, status, steps_completed, submitted_at) is deliberately NOT
-- granted: those writes go through the service-role client, which bypasses
-- both RLS and column grants. Staff have no reason to edit a visitor's
-- answers, and if that changes it should be a deliberate, audited action.
-- ===========================================================================

revoke update on public.submissions from authenticated;

-- The pipeline columns, and only these. closed_at and assigned_at are set by
-- the 0005 trigger rather than by hand, but the trigger writes through the
-- invoking role's statement, so the grant has to include them.
grant update (lead_stage, assigned_to, assigned_at, closed_at)
  on public.submissions to authenticated;

comment on policy "members update their tenant's submissions" on public.submissions is
  'Authorises the ROW (tenant isolation). Which COLUMNS may be written is a separate column grant, see migration 0006: RLS cannot express per-column rules.';


-- ===========================================================================
-- 2. Serialise team changes, and guard the last admin everywhere
--
-- The count-then-act in 0005's remove_teammate takes no lock, so under READ
-- COMMITTED two concurrent removals of two different admins both observe
-- v_admins = 2, both pass the guard, and both commit: zero admins, permanent
-- lockout with no in-app recovery.
--
-- A transaction-scoped advisory lock keyed on the tenant serialises every
-- team mutation for that tenant. It is coarse on purpose: these calls are
-- rare (an admin clicking a button), the contended window is microseconds,
-- and the correctness argument is much easier to verify than a set of row
-- locks across two tables. It releases automatically at commit or rollback,
-- so a failed call cannot leak it.
--
-- 0003's throttle functions solved the same class of problem with a single
-- atomic upsert. That does not work here because the invariant spans rows
-- ("how many admins remain"), which is exactly what a plain UPDATE cannot
-- see.
-- ===========================================================================

-- Shared helper so both RPCs lock the same key. hashtextextended is stable
-- across sessions, unlike hashtext's historical variants.
create or replace function public.lock_tenant_team(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('team:' || p_tenant::text, 0))
$$;

revoke execute on function public.lock_tenant_team(uuid) from public, anon, authenticated;

create or replace function public.set_teammate_role(
  p_profile_id uuid,
  p_role       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles.' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;

  -- Changing your own role is refused outright. Promoting yourself is
  -- meaningless (you are already an admin to be here) and demoting yourself
  -- is the lockout the count below exists to prevent.
  if p_profile_id = v_uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  perform public.lock_tenant_team(v_tenant);

  if not exists (
    select 1 from public.profiles
     where id = p_profile_id
       and tenant_id = v_tenant
       and deactivated_at is null
  ) then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  /*
    The guard 0005 forgot. Demoting the last admin other than yourself is the
    first half of a two-step lockout: A demotes B, then B (while still admin)
    demotes A. Neither call alone looks wrong, and the self-check above does
    not catch it because each caller is targeting someone else.

    Counted under the advisory lock, so a concurrent removal cannot change
    the answer between the count and the update.
  */
  if p_role = 'member' then
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
  end if;

  update public.profiles
     set role = p_role
   where id = p_profile_id
     and tenant_id = v_tenant;

  -- Audited inside the RPC, not by the caller afterwards. A second statement
  -- outside this transaction can fail, or be forgotten, and 0005's own
  -- argument for trigger-written submission events applies here: the audit
  -- must not depend on the app remembering.
  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  select
    v_tenant, v_uid, coalesce(a.full_name, a.email, 'staff'), 'role_changed',
    format('%s is now %s', coalesce(t.full_name, t.email, 'a teammate'), p_role)
    from public.profiles a, public.profiles t
   where a.id = v_uid and t.id = p_profile_id;
end;
$$;

create or replace function public.remove_teammate(
  p_profile_id   uuid,
  p_reassign_to  uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid := public.current_tenant_id();
  v_admins  integer;
  v_moved   integer;
  v_name    text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove teammates.' using errcode = '42501';
  end if;

  perform public.lock_tenant_team(v_tenant);

  select coalesce(full_name, email, 'a teammate') into v_name
    from public.profiles
   where id = p_profile_id
     and tenant_id = v_tenant
     and deactivated_at is null;

  if v_name is null then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  -- Counted under the lock now. Also pins the target to the tenant, which
  -- 0005's version omitted from this subquery.
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

  -- Release their leads first, so the 0005 update trigger logs each move
  -- while the profile is still active and its name still resolves.
  update public.submissions
     set assigned_to = p_reassign_to
   where tenant_id = v_tenant
     and assigned_to = p_profile_id;
  get diagnostics v_moved = row_count;

  update public.profiles
     set deactivated_at = now(),
         deactivated_by = v_uid
   where id = p_profile_id;

  /*
    Logged before this function returns, and specifically before the caller's
    own is_admin() could change. An admin may remove themselves (the guard
    only blocks it when they are the last one), and after that their own
    INSERT into tenant_events would be refused by the admin-only policy. A
    SECURITY DEFINER insert here is not subject to that policy, so a
    self-removal still leaves a record.
  */
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
$$;

grant  execute on function public.set_teammate_role(uuid, text) to authenticated;
grant  execute on function public.remove_teammate(uuid, uuid)   to authenticated;
revoke execute on function public.set_teammate_role(uuid, text) from public, anon;
revoke execute on function public.remove_teammate(uuid, uuid)   from public, anon;


-- ===========================================================================
-- 3. Serialise stage retirement, for the same reason
--
-- 0005's lead_stages_guard counts live stages without a lock, so two admins
-- retiring the last two stages concurrently each see one remaining and both
-- succeed. Zero live stages takes the discovery funnel down, because
-- submissions_default_stage then has nothing to resolve to. Unlikely, but the
-- blast radius is the revenue path.
-- ===========================================================================

create or replace function public.lead_stages_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live integer;
begin
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    raise exception 'lead_stages.slug is immutable; rename the label instead (slug %)', old.slug;
  end if;

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'lead_stages.tenant_id is immutable';
  end if;

  -- Retiring: never the default, never the last one standing.
  --
  -- The default check comes first and names the fix, because "make another
  -- stage the default first" is actionable where "a retired stage cannot be
  -- the default" only restates the rule. 0005 had these the other way round,
  -- so retiring the default produced the less useful message.
  if new.retired_at is not null and (tg_op = 'INSERT' or old.retired_at is null) then
    if new.is_default then
      raise exception 'Cannot retire the default stage. Make another stage the default first.';
    end if;

    perform public.lock_tenant_team(new.tenant_id);

    select count(*) into v_live
      from public.lead_stages
     where tenant_id = new.tenant_id
       and retired_at is null
       and id <> new.id;

    if v_live = 0 then
      raise exception 'Cannot retire the last remaining stage for this tenant.';
    end if;
  end if;

  if new.is_default and new.retired_at is not null then
    raise exception 'A retired stage cannot be the default stage.';
  end if;

  return new;
end;
$$;


-- ===========================================================================
-- 4. Tie a note to its submission's tenant, structurally
--
-- 0005's insert policy checks tenant_id = current_tenant_id() and
-- author_id = auth.uid(), but nothing ties submission_id to that tenant. A
-- member of tenant A who learns a submission id from tenant B could insert a
-- note with tenant_id = A and submission_id = B's lead: it passes the policy
-- and passes the single-column FK.
--
-- Today there is one tenant, so this is latent. It becomes reachable the
-- moment Phase 3 adds partners, and it is far cheaper to fix now than to
-- clean up afterwards. 0005 got this right for stages with a composite
-- (tenant_id, slug) key and the same reasoning applies here.
-- ===========================================================================

-- A composite FK needs a matching unique key on the parent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_tenant_id_key'
  ) then
    alter table public.submissions
      add constraint submissions_tenant_id_key unique (tenant_id, id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'submission_notes_submission_id_fkey'
       and conrelid = 'public.submission_notes'::regclass
  ) then
    alter table public.submission_notes
      drop constraint submission_notes_submission_id_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submission_notes_tenant_submission_fkey'
  ) then
    alter table public.submission_notes
      add constraint submission_notes_tenant_submission_fkey
      foreign key (tenant_id, submission_id)
      references public.submissions (tenant_id, id)
      on delete cascade;
  end if;
end $$;

-- Same treatment for events. The column arrived in 0001 with a single-column
-- FK; the trigger in 0005 always writes a matching tenant, but a direct
-- insert from a session client is policy-checked on tenant_id alone.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'submission_events_submission_id_fkey'
       and conrelid = 'public.submission_events'::regclass
  ) then
    alter table public.submission_events
      drop constraint submission_events_submission_id_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submission_events_tenant_submission_fkey'
  ) then
    alter table public.submission_events
      add constraint submission_events_tenant_submission_fkey
      foreign key (tenant_id, submission_id)
      references public.submissions (tenant_id, id)
      on delete cascade;
  end if;
end $$;


-- ===========================================================================
-- 5. Index tidy-up
--
-- submissions_tenant_stage_idx (tenant_id, lead_stage) is subsumed by
-- submissions_tenant_stage_created_idx (tenant_id, lead_stage, created_at
-- desc): a btree serves equality on any leading prefix, so the two-column
-- index only costs write amplification and storage. 0005 added both without
-- noticing the overlap.
--
-- submission_notes gains a tenant-leading index. Every read of it is
-- RLS-filtered on tenant_id, and 0005 indexed only (submission_id,
-- created_at), so the tenant predicate was a recheck on every row.
-- ===========================================================================

drop index if exists public.submissions_tenant_stage_idx;

create index if not exists submission_notes_tenant_submission_idx
  on public.submission_notes (tenant_id, submission_id, created_at desc);

-- Makes logRecordOpen's dedupe lookup an index scan rather than a filter.
-- It reads (submission_id, actor_id, action, created_at) and neither 0001's
-- (submission_id, created_at desc) nor 0005's (tenant_id, actor_id,
-- created_at desc) leads with the right columns.
create index if not exists submission_events_dedupe_idx
  on public.submission_events (submission_id, actor_id, action, created_at desc);
