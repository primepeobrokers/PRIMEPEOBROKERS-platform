-- ===========================================================================
-- 0007: only an invited account joins a tenant
--
-- THE HOLE THIS CLOSES
--
-- 0005 section 9 gated the *role* on invited_at, so a self-registered user
-- arrived as 'member' rather than 'admin'. That was necessary and not
-- sufficient: the insert into profiles ran unconditionally, outside the
-- `if v_invited` branch, so an uninvited signup still received a profile row
-- on the default tenant.
--
-- Membership is the whole ballgame. The read policy in 0001 is:
--
--     using (tenant_id = public.current_tenant_id())
--
-- with no role condition, so a 'member' profile reads every lead in the
-- tenant: company names, contact emails, headcount, and benefits spend. The
-- SOW's data-handling section requires no public or anonymous read path to
-- submission data, and a self-service signup form is one.
--
-- Anyone who can POST to /auth/v1/signup gets a profile, and self-signup is
-- enabled on the production project as of 2026-09-03.
--
-- THE FIX
--
-- Insert a profile only when GoTrue set invited_at, which an API caller
-- cannot forge: it is written by the invite admin endpoint, which requires
-- the service-role key. An uninvited account still gets an auth.users row
-- (nothing here can prevent that while signup is on) but no profile, and so
-- no tenant. current_tenant_id() returns null for it, every RLS policy
-- compares against null, and every policy therefore denies. It can sign in
-- and see an empty console shell with no lead data in it.
--
-- Turning self-signup off in the dashboard is still worth doing, and remains
-- the cleaner outer control. This migration means that toggle is no longer
-- the ONLY thing standing between a stranger and the lead table, which is the
-- posture something this sensitive deserves.
--
-- Safely re-runnable.
-- ===========================================================================


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid := '00000000-0000-4000-8000-000000000001';
  v_role     text := 'member';
  v_claimed  text;
begin
  -- The gate. invited_at is set by GoTrue on the admin invite path only, so
  -- it cannot be supplied by a self-signup request. No invite, no profile,
  -- no tenant, no data.
  if new.invited_at is null then
    return new;
  end if;

  -- Role, whitelisted. A junk or hostile value degrades to 'member' rather
  -- than raising: a failing trigger aborts the auth user creation, which
  -- would turn a typo in an invite into a baffling signup failure.
  v_claimed := new.raw_user_meta_data ->> 'role';
  v_role := case when v_claimed in ('admin', 'member') then v_claimed else 'member' end;

  -- Tenant, only if it actually exists. Phase 3 invites will carry a partner
  -- tenant here; an unknown id falls back to the default rather than creating
  -- an orphan profile pointing at nothing.
  v_claimed := new.raw_user_meta_data ->> 'tenant_id';
  if v_claimed is not null and exists (
    select 1 from public.tenants where id = v_claimed::uuid
  ) then
    v_tenant := v_claimed::uuid;
  end if;

  insert into public.profiles (id, tenant_id, full_name, role, email)
  values (
    new.id,
    v_tenant,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    new.email
  )
  on conflict (id) do nothing;

  return new;

exception
  when invalid_text_representation then
    -- A malformed tenant_id uuid in the invite metadata. Still an invited
    -- account, so it gets a profile, on the default tenant as a member.
    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (
      new.id,
      '00000000-0000-4000-8000-000000000001',
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      'member',
      new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a tenant profile for INVITED accounts only. A self-signup gets an '
  'auth user with no profile, so current_tenant_id() is null and every RLS '
  'policy denies. See migration 0007.';


-- ===========================================================================
-- A signed-in account with no profile must degrade to "no access", never to
-- an error page. current_tenant_id() and current_user_role() already return
-- null in that case (select ... into is null-safe on no rows), and the app
-- treats a null role as unauthenticated. Nothing further is needed here; this
-- note exists so the next reader does not go looking.
-- ===========================================================================


-- ===========================================================================
-- 2. A removed teammate loses data access on their very next request
--
-- THE HOLE THIS CLOSES
--
-- 0005 added `and deactivated_at is null` to current_user_role(), and the
-- removal action calls auth.admin.signOut(id, 'global'). Both were necessary.
-- Neither was sufficient, and the comment in app/console/team/actions.ts
-- claiming a failed signOut "narrows to their current token still works
-- briefly" was simply wrong.
--
-- Every RLS policy on submissions, submission_events, submission_notes,
-- profiles and tenants routes through current_tenant_id(), NOT through
-- current_user_role(). current_tenant_id() is defined once, in 0001, as an
-- unfiltered `select tenant_id from profiles where id = auth.uid()`. A
-- deactivated profile row still has its tenant_id, so it still passes.
--
-- The consequence: a removed teammate holding an unexpired access token could
-- read every lead, note and event in the tenant by calling PostgREST
-- directly, and could PATCH lead_stage and assigned_to (0006 grants those
-- columns to authenticated). The anon key is NEXT_PUBLIC_ and ships in every
-- client bundle, so nothing exotic is required. GoTrue's global signOut
-- revokes refresh tokens; an already-issued access token stays valid until it
-- expires, up to an hour.
--
-- One line fixes it, at the single chokepoint every policy already depends
-- on. Nothing else in the schema has to change.
-- ===========================================================================

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
    from public.profiles
   where id = auth.uid()
     and deactivated_at is null
$$;

grant  execute on function public.current_tenant_id() to authenticated;
revoke execute on function public.current_tenant_id() from public, anon;

comment on function public.current_tenant_id() is
  'Tenant of the signed-in user, or null if they have no profile or have been '
  'deactivated. Every RLS policy depends on this, so the deactivation filter '
  'here is what actually revokes a removed teammate. See migration 0007.';


-- ===========================================================================
-- 3. Removal demotes to member, so Restore cannot silently return an admin
--
-- remove_teammate stamped deactivated_at and left role alone, so a profile
-- removed while role='admin' came back as an admin the moment any admin
-- clicked Restore: no confirmation, no last-admin count, no audit line saying
-- a role was granted. Restore is a one-click control with no dialog.
--
-- Demoting on the way out makes Restore always additive-but-minimal. Getting
-- an admin back is then a deliberate, logged, guarded role change through
-- set_teammate_role, which is where that decision belongs.
-- ===========================================================================

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

  /*
    Demote as part of removal. Restore is a one-click control with no dialog,
    and without this a profile removed while role='admin' comes back an admin:
    no last-admin count, no confirmation, no audit line saying a role was
    granted. Re-granting admin is then a deliberate trip through
    set_teammate_role, which is where that decision belongs.
  */
  update public.profiles
     set deactivated_at = now(),
         deactivated_by = v_uid,
         role           = 'member'
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

grant  execute on function public.remove_teammate(uuid, uuid) to authenticated;
revoke execute on function public.remove_teammate(uuid, uuid) from public, anon;


-- ===========================================================================
-- 4. Retire a stage in one transaction, under the team lock
--
-- The app did this as two statements: move every lead off the stage, then
-- retire the stage. A failure between them left the leads moved while the
-- error said "Could not retire that stage", so the admin retried and the
-- second attempt reported 0 leads moved. The audit line then recorded a
-- retirement with no mention of leads that had already been relocated.
--
-- Concurrently it was worse. Two admins retiring two stages, each choosing
-- the other's stage as the destination, could interleave so that leads landed
-- on a stage that was retired moments later. lead_stages_guard takes the
-- advisory lock, but only around the retire statement: the bulk update of
-- submissions sat outside it, in a separate transaction.
--
-- A function body is one transaction, and taking the same lock the team
-- mutations use serialises the whole operation against them.
-- ===========================================================================

create or replace function public.retire_stage(
  p_stage_id uuid,
  p_move_to  text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_slug    text;
  v_moved   integer := 0;
begin
  if v_tenant is null or not public.is_admin() then
    raise exception 'Only an admin can change the pipeline.' using errcode = '42501';
  end if;

  perform public.lock_tenant_team(v_tenant);

  -- Both stages are re-read here, inside the lock and scoped to the tenant,
  -- so a stage retired by someone else a moment ago cannot be a destination.
  select slug into v_slug
    from public.lead_stages
   where id = p_stage_id
     and tenant_id = v_tenant
     and retired_at is null;

  if v_slug is null then
    raise exception 'That stage is not in your pipeline.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.lead_stages
     where tenant_id = v_tenant
       and slug = p_move_to
       and retired_at is null
       and id <> p_stage_id
  ) then
    raise exception 'Pick a stage that is still in the pipeline.' using errcode = 'P0002';
  end if;

  -- Per-row so the 0005 trigger writes an activity entry for each lead.
  update public.submissions
     set lead_stage = p_move_to
   where tenant_id = v_tenant
     and lead_stage = v_slug;
  get diagnostics v_moved = row_count;

  -- lead_stages_guard still runs and still refuses the default stage and the
  -- last live stage. It raises, which aborts this whole function, so the
  -- lead moves above roll back with it. That is the entire point.
  update public.lead_stages
     set retired_at = now()
   where id = p_stage_id
     and tenant_id = v_tenant;

  return v_moved;
end;
$$;

grant  execute on function public.retire_stage(uuid, text) to authenticated;
revoke execute on function public.retire_stage(uuid, text) from public, anon;

comment on function public.retire_stage(uuid, text) is
  'Moves every lead off a stage and retires it atomically, under the tenant '
  'team lock. Replaces the two-statement app-side version. See migration 0007.';
