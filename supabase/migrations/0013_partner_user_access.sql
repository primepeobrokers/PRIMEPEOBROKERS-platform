-- ===========================================================================
-- 0013: set_partner_user_access, closing the last unguarded partner mutation
--
-- TWO PROBLEMS, ONE RPC
--
-- 1. THE MISSING THIRD LAYER
--
-- app/console/partners/actions.ts opens by claiming staff-only is "enforced
-- three times over": the page guard, guardStaff() in the action, and the
-- database RPC re-deriving the caller from auth.uid(). That is true of
-- create_partner, set_partner_branding, set_partner_suspended and
-- route_submission, all added in 0011.
--
-- It was NOT true of setPartnerUserActive. That one reached for the
-- service-role client and ran a direct UPDATE on profiles, because profiles
-- has had no UPDATE policy since 0005 and no RPC existed. A server action is
-- an addressable endpoint, so the only thing standing between a caller and
-- another tenant's profile row was TypeScript.
--
-- 2. THE MISSING LAST-ADMIN GUARD
--
-- remove_teammate (0006 section 2) refuses to remove the last admin of the
-- house team, under an advisory lock, because the count-then-act is a race:
-- two concurrent removals both observe two admins, both pass, both commit,
-- and the tenant is locked out with no in-app recovery.
--
-- The partner path had no equivalent. Staff could deactivate every user on a
-- live, unsuspended partner and leave them with a working portal and no way
-- in. Recoverable by re-inviting, so not catastrophic, but it is exactly the
-- asymmetry the action's own comment claims to be avoiding when it refuses
-- the house tenant "so those rules cannot be bypassed through this route".
--
-- WHY "LAST ACTIVE USER" AND NOT "LAST ADMIN"
--
-- inviteIntoTenant stamps role: 'admin' on every partner invite (it grants
-- nothing outside the tenant; is_platform_staff is derived, never trusted
-- from metadata). Verified on the live project: every partner tenant holds
-- exactly one profile, role 'admin', is_platform_staff false. So for a
-- partner the two questions are the same one, and the invariant worth
-- protecting is "this partner can still sign in", not "this partner still has
-- an admin". Counted under the same advisory lock as the house team.
--
-- Reuses lock_tenant_team(uuid) (0006) and require_platform_staff() (0011)
-- rather than restating either: one lock key per tenant is what makes the
-- count-then-act safe, and a second key would serialise nothing.
--
-- Safely re-runnable.
-- ===========================================================================

create or replace function public.set_partner_user_access(
  p_tenant_id  uuid,
  p_profile_id uuid,
  p_active     boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $set_partner_user_access$
declare
  v_uid     uuid := public.require_platform_staff();
  v_house   boolean;
  v_tname   text;
  v_who     text;
  v_was_off timestamptz;
  v_active  integer;
  v_actor   text;
begin
  select is_house, name into v_house, v_tname
    from public.tenants
   where id = p_tenant_id;

  if v_tname is null then
    raise exception 'That partner no longer exists.' using errcode = 'P0002';
  end if;

  /*
    The house team is managed at /console/team, which has its own last-admin
    and self-removal rules in 0006. Refusing it here keeps this route from
    being a way around them.
  */
  if v_house then
    raise exception 'Manage your own team from the Team screen.'
      using errcode = '42501';
  end if;

  -- Serialises every team mutation for this tenant, so the count below cannot
  -- be invalidated by a concurrent call between the count and the update.
  perform public.lock_tenant_team(p_tenant_id);

  /*
    Pinned to BOTH ids. A profile id alone would let a tampered value move a
    user on another tenant: this is security definer, so it bypasses RLS
    exactly as the service-role client did.
  */
  select coalesce(full_name, email, 'That person'), deactivated_at
    into v_who, v_was_off
    from public.profiles
   where id = p_profile_id
     and tenant_id = p_tenant_id;

  if v_who is null then
    raise exception 'That person is not on this partner.' using errcode = 'P0002';
  end if;

  -- Idempotent: saying "remove" twice is not an error, and returning early
  -- keeps a duplicate click from writing a second identical audit row.
  if (p_active and v_was_off is null) or (not p_active and v_was_off is not null) then
    return v_who;
  end if;

  if not p_active then
    select count(*) into v_active
      from public.profiles
     where tenant_id = p_tenant_id
       and deactivated_at is null;

    /*
      The guard. Counted under the lock, and only on the way down: restoring
      access can never strand anyone.
    */
    if v_active <= 1 then
      raise exception
        'That is the only person who can sign in to %. Invite someone else first, or suspend the partner.',
        v_tname
        using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set deactivated_at = case when p_active then null else now() end,
         deactivated_by = case when p_active then null else v_uid end
   where id = p_profile_id
     and tenant_id = p_tenant_id;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  /*
    Logged against the PARTNER's tenant, not the house one, unlike
    set_partner_suspended. This is a change to that partner's roster and
    belongs in their own history; suspension is a change to the platform's
    relationship with them.
  */
  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    p_tenant_id, v_uid, v_actor,
    case when p_active then 'reactivated' else 'removed' end,
    format('%s %s', v_who, case when p_active then 'restored' else 'removed' end)
  );

  return v_who;
end;
$set_partner_user_access$;

grant  execute on function public.set_partner_user_access(uuid, uuid, boolean) to authenticated;
revoke execute on function public.set_partner_user_access(uuid, uuid, boolean) from public, anon;

comment on function public.set_partner_user_access(uuid, uuid, boolean) is
  'Platform staff only. Deactivates or restores one partner user, refusing to '
  'leave a partner with nobody able to sign in. Counted under lock_tenant_team.';
