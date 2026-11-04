-- ===========================================================================
-- 0019: partner contact details
--
-- The client's partner template, November 2026 (after All Staff's feedback).
-- Three new branding keys, all printed on the partner's own pages:
--
--   contactEmail    Contact, Talk to an advisor, the FAQ, the footer contact
--                   line and the sign-in help line.
--   phone           optional, footer contact line.
--   mailingAddress  optional, footer contact line.
--
-- legalName already exists (0015). contactUrl, the URL-or-email field 0015
-- added, is replaced by contactEmail: the one row that set it held an email
-- address, moved across below. The key stays in the allowlist so a console
-- still running the previous build can save; the current build never writes
-- it, and parseBranding reads an address left there as the contact email.
--
-- Values are validated in lib/tenant/branding.ts (on save and on read), not
-- here, as for every other branding key.
--
-- Apply BEFORE deploying the matching code: until it runs, the console's
-- branding save is refused with "Unknown branding key: contactEmail".
-- ===========================================================================

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
      'companyName','shortName','logo','colors','supportEmail','crmPartnerName',
      'legalName','contactUrl','contactEmail','phone','mailingAddress'
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


-- ---------------------------------------------------------------------------
-- contactUrl -> contactEmail, for rows whose contactUrl is an email address.
-- A URL is left where it is (none exist as of 2026-11-04); the app ignores it.
-- Never overwrites a contactEmail that is already set.
-- ---------------------------------------------------------------------------

update public.tenants
   set branding = (branding - 'contactUrl')
                  || jsonb_build_object('contactEmail', lower(branding->>'contactUrl'))
 where branding ? 'contactUrl'
   and not (branding ? 'contactEmail')
   and branding->>'contactUrl' ~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$';
