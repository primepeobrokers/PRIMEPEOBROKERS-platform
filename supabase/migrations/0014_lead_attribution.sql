-- ===========================================================================
-- 0014: lead attribution, so the Rep Desk credits the right partner
--
-- Client update list items 28 and 29, 2026-09-29.
--
-- WHAT THIS ADDS
--
-- One setting per partner (the partner's name as the CRM knows it) and one
-- column on submissions that records it onto every lead at the moment the
-- lead is created.
--
-- WHY THE NAME IS COPIED ONTO THE LEAD RATHER THAN JOINED
--
-- tenant_id is already on every submission, so the attribution could be read
-- through a join at export time. It is stored instead, because the two answer
-- different questions. The join answers "who owns this partner today"; the
-- column answers "who was credited for this lead when it came in". A partner
-- that is renamed in the CRM, re-provisioned, or merged into another would
-- silently rewrite its own history under a join, and commission is paid off
-- that history. Denormalising here is the same call 0001 made for
-- company_name and contact_email, and for the same reason.
--
-- Nullable, with no backfill. Leads that arrived before this migration were
-- genuinely not attributed, and writing a value we inferred later would make
-- a guess indistinguishable from a record.
-- ===========================================================================

alter table public.submissions
  -- The tenant's CRM-facing name at submission time, which is not always the
  -- name we display.
  add column if not exists crm_partner_name text;

comment on column public.submissions.crm_partner_name is
  'Partner credited for this lead, captured at submission. Not a live join: '
  'renaming or re-provisioning a partner must not rewrite paid history.';

-- The export groups by partner within a tenant.
create index if not exists submissions_tenant_partner_idx
  on public.submissions (tenant_id, crm_partner_name)
  where crm_partner_name is not null;

-- ---------------------------------------------------------------------------
-- set_partner_branding: admit the three new keys
--
-- The function validates SHAPE only, and 0011's comment explains why: the
-- values are validated in lib/tenant/branding.ts, where a bad one degrades to
-- a house default instead of 500ing a partner's portal. That split still
-- holds. What this function owns is the key allowlist, so a typo cannot
-- persist a key the reader will never look at, and three new keys mean the
-- allowlist has to learn them.
--
-- Everything else about the function is unchanged. Restated in full rather
-- than patched because `create or replace` needs the whole body, and a
-- migration that silently dropped the last-admin guard or the audit write
-- would be worse than a little duplication.
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
    if v_key not in (
      'companyName','shortName','logo','colors','supportEmail','crmPartnerName'
    ) then
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
