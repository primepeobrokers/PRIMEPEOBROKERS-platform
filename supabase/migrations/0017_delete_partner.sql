-- ===========================================================================
-- 0017: delete_partner, for test partners and partners that never went live
--
-- 0011 made suspension the only way to retire a partner, on purpose: a
-- partner's leads are commercially valuable to the client and 0015's consent
-- records must survive six years. That still holds. What it left behind is a
-- roster cluttered with test tenants that hold nothing but a login and the
-- four seeded stages, and there was no way to remove them without SQL.
--
-- WHAT CAN BE DELETED
--
-- A partner that is (a) not the house tenant, (b) already suspended, and
-- (c) has never received a lead or a consent record. Everything else is
-- refused with a sentence saying why, and suspension remains the answer.
--
--   * Suspended first, so a delete is always the second deliberate step and
--     never the first click on a live portal.
--   * No leads, because deleting a tenant would have to delete its leads, and
--     those belong to the client's pipeline, not to the partner.
--   * No consent records, because consent_records_retain_trg (0015) forbids
--     deleting one inside six years, and its tenant_id FK forbids orphaning
--     one. A partner with a consent record is kept, full stop. Today a consent
--     record implies a lead, but a lead can be routed to another partner
--     while its consent record stays put, so both are checked.
--
-- The caller must also pass the partner's slug. The UI makes staff type it;
-- the check here means a stale or mistaken id cannot delete the wrong row.
--
-- WHAT GOES WITH IT
--
-- lead_stages and the partner's own tenant_events cascade (0005). Its
-- profiles are deleted here, which nulls the profile's id wherever it was
-- recorded as an actor or inviter (every such FK is on delete set null). The
-- auth.users rows are NOT touched in SQL: the function returns their ids and
-- the server action deletes them through the Auth admin API, which is the
-- supported path and also clears sessions and identities. Until it does, an
-- auth user with no profile reaches nothing: tenant_scope() (0009) reads
-- profiles, so its scope is empty.
--
-- The partner's logo file is also left to the action, which owns Storage.
--
-- RACES
--
-- The tenant row is locked FOR UPDATE before the checks. A concurrent insert
-- of a submission takes FOR KEY SHARE on the same row through its FK, which
-- conflicts, so a lead cannot slip in between the check and the delete. If
-- one somehow did, the submissions FK (no action) still fails the delete.
--
-- DEPLOY ORDER: migration first. The console calls this RPC; before it exists
-- the delete button fails with a generic error and nothing is removed.
-- ===========================================================================

create or replace function public.delete_partner(
  p_tenant_id uuid,
  p_slug      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $delete_partner$
declare
  v_uid       uuid := public.require_platform_staff();
  v_tenant    public.tenants%rowtype;
  v_leads     integer;
  v_consents  integer;
  v_user_ids  uuid[];
  v_actor     text;
begin
  select * into v_tenant
    from public.tenants
   where id = p_tenant_id
     for update;

  if not found then
    raise exception 'That partner no longer exists.' using errcode = 'P0002';
  end if;

  if v_tenant.is_house then
    raise exception 'You cannot delete Prime PEO Brokers itself.'
      using errcode = '42501';
  end if;

  if lower(trim(coalesce(p_slug, ''))) <> v_tenant.slug then
    raise exception 'The subdomain you typed does not match %. Nothing was deleted.',
      v_tenant.slug
      using errcode = '22023';
  end if;

  if v_tenant.suspended_at is null then
    raise exception 'Suspend % before deleting it.', v_tenant.name
      using errcode = '55000';
  end if;

  select count(*) into v_leads
    from public.submissions where tenant_id = p_tenant_id;
  select count(*) into v_consents
    from public.consent_records where tenant_id = p_tenant_id;

  if v_leads > 0 or v_consents > 0 then
    raise exception
      '% cannot be deleted because it has received leads. Partners with lead history are kept; leave it suspended instead.',
      v_tenant.name
      using errcode = '55000';
  end if;

  select coalesce(array_agg(id), '{}') into v_user_ids
    from public.profiles where tenant_id = p_tenant_id;

  delete from public.profiles where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  -- Recorded on the house tenant: the partner's own log has just gone with it.
  insert into public.tenant_events (tenant_id, actor_id, actor, action, detail)
  values (
    (select id from public.tenants where is_house limit 1),
    v_uid, v_actor, 'partner_deleted',
    format('%s (%s) deleted', v_tenant.name, v_tenant.slug)
  );

  return jsonb_build_object(
    'name',      v_tenant.name,
    'user_ids',  to_jsonb(v_user_ids),
    'logo_path', v_tenant.branding #>> '{logo,path}'
  );
end;
$delete_partner$;

grant  execute on function public.delete_partner(uuid, text) to authenticated;
revoke execute on function public.delete_partner(uuid, text) from public, anon;

comment on function public.delete_partner(uuid, text) is
  'Deletes a suspended partner that has never received a lead or consent '
  'record, with its stages, events and profiles. Platform staff only; the '
  'slug must match. Returns the auth user ids and logo path for the caller '
  'to clean up. See migration 0017.';
