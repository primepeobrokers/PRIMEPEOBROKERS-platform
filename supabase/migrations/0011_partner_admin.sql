-- ===========================================================================
-- 0011 · Phase 3: partner administration
--
-- Closes the three SOW deliverables the foundation left as scripts or gaps:
--
--   * "Admin controls for the client to add a partner, configure branding, and
--      issue partner logins without developer involvement."
--   * "Per-partner branding: logo, colour palette, and company name, all
--      configurable without a redeploy."
--   * "Ability to reassign or route a submission between partners."
--
-- WHY RPCs AND NOT RLS POLICIES
--
-- Every operation here is cross-tenant by nature: creating a tenant, editing
-- another tenant's branding, moving a lead from one tenant to another. RLS is
-- built to confine a caller to rows in their scope, so expressing "may act on
-- ANY tenant, but only if platform staff" as a policy would mean widening the
-- write policies for everyone and re-narrowing them in application code. That
-- inverts the design: 0009 deliberately kept lead_stages and tenant_events
-- writes home-tenant only for exactly this reason.
--
-- So: no new write policies. These SECURITY DEFINER functions re-derive the
-- caller from auth.uid() and check is_platform_staff themselves, which is the
-- same shape as the team RPCs from 0005/0006 (page guard, action guard, then
-- the RPC checks again, because a server action is an addressable endpoint).
--
-- WHY tenant_id IS STILL NOT WRITABLE DIRECTLY
--
-- 0009's submissions UPDATE policy repeats `with check`, so a lead cannot
-- change tenants through a plain UPDATE, and tenant_id is outside the 0006
-- column grant. Both stay exactly as they are. route_submission below is the
-- only path, so "move a lead between partners" is one auditable, guarded
-- operation rather than a widened column.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A guard, so every function below fails the same way
-- ---------------------------------------------------------------------------

create or replace function public.require_platform_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $require_platform_staff$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean;
begin
  select is_platform_staff and deactivated_at is null
    into v_ok
    from public.profiles
   where id = v_uid;

  -- coalesce: no profile row leaves v_ok null, which must deny.
  if not coalesce(v_ok, false) then
    raise exception 'Only the Prime PEO Brokers team can manage partners.'
      using errcode = '42501';
  end if;
  return v_uid;
end;
$require_platform_staff$;

grant  execute on function public.require_platform_staff() to authenticated;
revoke execute on function public.require_platform_staff() from public, anon;

comment on function public.require_platform_staff() is
  'Returns the caller''s id, or raises 42501 unless they are active platform '
  'staff. The shared guard for every partner-administration RPC. See 0011.';


-- ---------------------------------------------------------------------------
-- 2. create_partner: a tenant that can actually accept a lead
--
-- Provisioning is one transaction on purpose. A tenant with no lead_stages
-- REJECTS EVERY SUBMISSION on its subdomain: submissions_default_stage()
-- (0005) raises 'Tenant % has no lead stages configured'. So a half-created
-- partner is worse than none, because the subdomain resolves, the visitor
-- completes six steps, and the insert fails at the end.
--
-- The four stages match the 0005 seed for the founding tenant, so every
-- tenant starts from the same pipeline the SOW named.
-- ---------------------------------------------------------------------------

create or replace function public.create_partner(
  p_slug text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_partner$
declare
  v_uid    uuid := public.require_platform_staff();
  v_slug   text := lower(btrim(coalesce(p_slug, '')));
  v_name   text := btrim(coalesce(p_name, ''));
  v_tenant uuid;
  v_actor  text;
begin
  if v_name = '' or length(v_name) > 200 then
    raise exception 'Give the partner a company name of 200 characters or fewer.'
      using errcode = '22023';
  end if;

  -- Mirrors the tenants.slug CHECK from 0001. Raised here with a message an
  -- admin can act on, rather than surfacing a constraint code.
  if v_slug !~ '^[a-z0-9-]{2,63}$' then
    raise exception 'The subdomain must be 2 to 63 characters, lowercase letters, numbers and hyphens only.'
      using errcode = '22023';
  end if;

  /*
    Labels that would shadow infrastructure. Kept in step with RESERVED in
    lib/tenant/host.ts, which treats these as the apex: a tenant holding one
    would be provisioned, billed and invisible, because classifyHost would
    never route to it.
  */
  if v_slug in (
    'www','app','admin','console','portal','api','auth','mail','email','smtp',
    'static','assets','cdn','img','images','media','files','storage',
    'staging','preview','dev','test','vercel','status','docs','blog',
    'support','help'
  ) then
    raise exception 'That subdomain is reserved. Choose another.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'A partner already uses the subdomain %.', v_slug
      using errcode = '23505';
  end if;

  insert into public.tenants (slug, name)
  values (v_slug, v_name)
  returning id into v_tenant;

  -- Without these the partner's subdomain rejects every submission.
  insert into public.lead_stages
    (tenant_id, slug, label, sort_order, is_default, is_terminal, tone)
  values
    (v_tenant, 'new',         'New',         10, true,  false, 'neutral'),
    (v_tenant, 'in-progress', 'In progress', 20, false, false, 'accent'),
    (v_tenant, 'contacted',   'Contacted',   30, false, false, 'warning'),
    (v_tenant, 'closed',      'Closed',      40, false, true,  'positive');

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  -- Logged against the HOUSE tenant, not the new one: this is an action the
  -- client's team took, and it belongs in the client's audit trail. The new
  -- partner's own log starts empty.
  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    (select id from public.tenants where is_house limit 1),
    v_uid, v_actor, 'partner_created',
    format('%s created (%s)', v_name, v_slug)
  );

  return v_tenant;
end;
$create_partner$;

grant  execute on function public.create_partner(text, text) to authenticated;
revoke execute on function public.create_partner(text, text) from public, anon;

comment on function public.create_partner(text, text) is
  'Creates a partner tenant AND seeds its four lead stages in one '
  'transaction. The stages are not optional: a tenant without them rejects '
  'every submission on its subdomain. Platform staff only. See 0011.';


-- ---------------------------------------------------------------------------
-- 3. set_partner_branding: the "without a redeploy" deliverable
--
-- Shape only. Colour and logo VALUES are validated in
-- lib/tenant/branding.ts, deliberately: the hex allowlist there is a
-- CSS-injection boundary (values land inside a <style> element, where React
-- escapes < but not } or ;), and a bad colour must degrade to the house token
-- rather than block the write and 500 a partner's portal. Enforcing that here
-- would duplicate the rule in a place that cannot degrade.
--
-- What this DOES enforce is that branding stays an object and that only known
-- top-level keys are accepted, so a typo cannot silently persist a key the
-- reader will never look at.
-- ---------------------------------------------------------------------------

create or replace function public.set_partner_branding(
  p_tenant_id uuid,
  p_branding  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $set_partner_branding$
declare
  v_uid   uuid := public.require_platform_staff();
  v_name  text;
  v_actor text;
  v_key   text;
begin
  if jsonb_typeof(coalesce(p_branding, 'null'::jsonb)) <> 'object' then
    raise exception 'Branding must be a JSON object.' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_branding) loop
    if v_key not in ('companyName','shortName','logo','colors','supportEmail') then
      raise exception 'Unknown branding key: %', v_key using errcode = '22023';
    end if;
  end loop;

  select name into v_name from public.tenants where id = p_tenant_id;
  if v_name is null then
    raise exception 'That partner no longer exists.' using errcode = 'P0002';
  end if;

  update public.tenants set branding = p_branding where id = p_tenant_id;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    (select id from public.tenants where is_house limit 1),
    v_uid, v_actor, 'partner_branding_changed',
    format('Branding updated for %s', v_name)
  );
end;
$set_partner_branding$;

grant  execute on function public.set_partner_branding(uuid, jsonb) to authenticated;
revoke execute on function public.set_partner_branding(uuid, jsonb) from public, anon;


-- ---------------------------------------------------------------------------
-- 4. set_partner_suspended: stop a portal without deleting anything
--
-- resolve.ts treats a suspended tenant as absent, so the subdomain 404s while
-- every referencing row survives. Deliberately NOT a delete: the leads stay
-- commercially valuable to the client, who did the work on them.
--
-- Note this does not revoke the partner's users on its own. Their profiles
-- must be deactivated too, which is what tenant_scope() filters. Doing both
-- is the caller's job, and the app does both.
-- ---------------------------------------------------------------------------

create or replace function public.set_partner_suspended(
  p_tenant_id uuid,
  p_suspended boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $set_partner_suspended$
declare
  v_uid   uuid := public.require_platform_staff();
  v_name  text;
  v_house boolean;
  v_actor text;
begin
  select name, is_house into v_name, v_house
    from public.tenants where id = p_tenant_id;
  if v_name is null then
    raise exception 'That partner no longer exists.' using errcode = 'P0002';
  end if;

  -- Suspending the house tenant would 404 the client's own marketing site and
  -- console, and there is no path back through the UI once it is down.
  if v_house then
    raise exception 'You cannot suspend Prime PEO Brokers itself.'
      using errcode = '42501';
  end if;

  update public.tenants
     set suspended_at = case when p_suspended then now() else null end
   where id = p_tenant_id;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    (select id from public.tenants where is_house limit 1),
    v_uid, v_actor,
    case when p_suspended then 'partner_suspended' else 'partner_restored' end,
    format('%s %s', v_name, case when p_suspended then 'suspended' else 'restored' end)
  );
end;
$set_partner_suspended$;

grant  execute on function public.set_partner_suspended(uuid, boolean) to authenticated;
revoke execute on function public.set_partner_suspended(uuid, boolean) from public, anon;


-- ---------------------------------------------------------------------------
-- 5. route_submission: move a lead between partners
--
-- The last SOW deliverable, and the one that needs the most care, because a
-- lead's tenant_id is the isolation boundary itself. Moving it hands the lead
-- and its whole history to a different partner.
--
-- Four things have to move together or the row becomes unreadable:
--
--   1. submissions.tenant_id
--   2. lead_stage, because the stage FK is composite (tenant_id, slug) and the
--      destination may not have a stage with that slug at all
--   3. submission_notes.tenant_id and submission_events.tenant_id, whose FKs
--      are composite (tenant_id, submission_id) since 0006
--   4. assigned_to, because submissions_guard_assignee only permits an
--      assignee in the lead's tenant or platform staff
--
-- Miss any one and the operation either fails a constraint or, worse, leaves
-- history stranded in the old tenant where the new partner cannot read it and
-- the old one still can.
-- ---------------------------------------------------------------------------

create or replace function public.route_submission(
  p_submission_id uuid,
  p_to_tenant     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $route_submission$
declare
  v_uid       uuid := public.require_platform_staff();
  v_from      uuid;
  v_stage     text;
  v_assignee  uuid;
  v_to_name   text;
  v_from_name text;
  v_new_stage text;
  v_keep      boolean;
  v_actor     text;
  v_ref       bigint;
begin
  select tenant_id, lead_stage, assigned_to, ref
    into v_from, v_stage, v_assignee, v_ref
    from public.submissions
   where id = p_submission_id;
  if v_from is null then
    raise exception 'That lead no longer exists.' using errcode = 'P0002';
  end if;

  select name into v_to_name from public.tenants
   where id = p_to_tenant and suspended_at is null;
  if v_to_name is null then
    raise exception 'That destination is not an active partner.' using errcode = 'P0002';
  end if;

  if v_from = p_to_tenant then
    raise exception 'That lead is already with %.', v_to_name using errcode = '22023';
  end if;

  select name into v_from_name from public.tenants where id = v_from;

  /*
    Resolve the destination stage BEFORE moving anything. Keep the same slug
    when the destination has it live, so a lead mid-pipeline does not silently
    reset to New; otherwise fall to the destination's default. The composite FK
    would reject an unknown slug, so this is not merely cosmetic.
  */
  select true into v_keep
    from public.lead_stages
   where tenant_id = p_to_tenant and slug = v_stage and retired_at is null;

  if coalesce(v_keep, false) then
    v_new_stage := v_stage;
  else
    select slug into v_new_stage
      from public.lead_stages
     where tenant_id = p_to_tenant and is_default and retired_at is null
     limit 1;
    if v_new_stage is null then
      select slug into v_new_stage
        from public.lead_stages
       where tenant_id = p_to_tenant and retired_at is null
       order by sort_order, slug
       limit 1;
    end if;
    if v_new_stage is null then
      raise exception '% has no lead stages configured, so it cannot receive a lead.', v_to_name
        using errcode = '23503';
    end if;
  end if;

  /*
    Release an assignee who cannot legitimately own the lead in its new home.
    Platform staff may follow it (the SOW: the client's team does the work); a
    partner's own user may not, and submissions_guard_assignee would reject
    the row anyway.
  */
  if v_assignee is not null and not exists (
    select 1 from public.profiles
     where id = v_assignee and is_platform_staff and deactivated_at is null
  ) then
    v_assignee := null;
  end if;

  /*
    Order matters. submissions must move FIRST: the composite FKs on notes and
    events point at (tenant_id, submission_id), so updating a child to the new
    tenant before the parent exists there violates the constraint. Updating the
    parent first is fine because the children are not re-validated until they
    are themselves updated, and this is all one transaction.

    lead_stage and assigned_to move in the same statement, so the row is never
    momentarily inconsistent with either FK or the assignee trigger.
  */
  update public.submissions
     set tenant_id   = p_to_tenant,
         lead_stage  = v_new_stage,
         assigned_to = v_assignee
   where id = p_submission_id;

  update public.submission_notes
     set tenant_id = p_to_tenant
   where submission_id = p_submission_id;

  update public.submission_events
     set tenant_id = p_to_tenant
   where submission_id = p_submission_id;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  -- On the lead's own timeline, so the receiving partner can see where it came
  -- from rather than finding an unexplained lead in their list.
  insert into public.submission_events
    (tenant_id, submission_id, actor_id, actor, action, detail)
  values (
    p_to_tenant, p_submission_id, v_uid, v_actor, 'routed',
    format('Routed from %s to %s', coalesce(v_from_name, 'a partner'), v_to_name)
  );

  -- And in the client's audit trail.
  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    (select id from public.tenants where is_house limit 1),
    v_uid, v_actor, 'lead_routed',
    format('Lead #%s routed from %s to %s', v_ref,
           coalesce(v_from_name, 'a partner'), v_to_name)
  );
end;
$route_submission$;

grant  execute on function public.route_submission(uuid, uuid) to authenticated;
revoke execute on function public.route_submission(uuid, uuid) from public, anon;

comment on function public.route_submission(uuid, uuid) is
  'Moves a lead and its whole history to another partner, re-resolving the '
  'stage against the destination''s pipeline and releasing an assignee who '
  'could not own it there. The ONLY path that changes submissions.tenant_id: '
  'the UPDATE policy and column grant both still forbid it. See 0011.';


-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------

do $assert_0011$
declare
  v_fn text;
begin
  -- Every function must exist and be callable by authenticated, or the admin
  -- screen renders a button that always errors.
  for v_fn in
    select unnest(array[
      'require_platform_staff()',
      'create_partner(text,text)',
      'set_partner_branding(uuid,jsonb)',
      'set_partner_suspended(uuid,boolean)',
      'route_submission(uuid,uuid)'
    ])
  loop
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'authenticated cannot execute %', v_fn;
    end if;
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'anon CAN execute %. Revoke it.', v_fn;
    end if;
  end loop;

  /*
    tenant_id must remain unwritable through a plain UPDATE. route_submission
    is SECURITY DEFINER so it is unaffected by the column grant, and that is
    the point: one guarded, audited path rather than a widened column.
  */
  if exists (
    select 1
      from information_schema.column_privileges
     where table_schema = 'public'
       and table_name = 'submissions'
       and column_name = 'tenant_id'
       and grantee = 'authenticated'
       and privilege_type = 'UPDATE'
  ) then
    raise exception
      'authenticated has UPDATE on submissions.tenant_id. Leads could be moved between tenants without route_submission.';
  end if;
end $assert_0011$;
