-- ===========================================================================
-- 0015: partner compliance and the consent record
--
-- Counsel's pre-launch list for partner tenants, October 2026. Three parts:
--
--   1. set_partner_branding admits two new keys: legalName (named in the
--      footer disclosure) and contactUrl (where "Contact" and "Talk to an
--      advisor" go on the partner's pages).
--   2. consent_records: one row per submission, kept six years, exportable.
--   3. record_sms_opt_out: how a STOP reply reaches that record.
--
-- WHAT IS DELIBERATELY NOT HERE: any way for a partner to set the disclosure,
-- the Powered-by line, the policy links, the consent wording, the savings
-- claims or the FAQ answers. Counsel listed those as locked, and they are
-- locked by not being data at all: they are constants in the code
-- (lib/legal.ts, app/components/legal-disclosure.tsx). The branding key
-- allowlist below is what stops a partner row from carrying anything else,
-- including scripts or tracking pixels.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. set_partner_branding: two new keys
--
-- Restated in full, as 0014 did, because `create or replace` needs the whole
-- body. Only the allowlist changes. Values are still validated in
-- lib/tenant/branding.ts, where a bad one degrades to a default instead of
-- 500ing a partner's page; contactUrl in particular is rendered as an href,
-- and parseBranding admits only https URLs and email addresses for it.
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
      'companyName','shortName','logo','colors','supportEmail','crmPartnerName',
      'legalName','contactUrl'
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
-- 2. is_house_member: is the caller on Prime's own team?
--
-- Consent records carry IP addresses and user agents. The amended privacy
-- policy tells visitors that a referral partner receives their name, company,
-- contact details and evaluation status, and nothing about devices or
-- networks. So these rows are readable by Prime's team only, never by a
-- partner's portal login, even for the partner's own leads.
--
-- Not is_platform_staff: that flag means "can manage partners", and a future
-- house teammate without it should still see the consent behind a lead they
-- are working.
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
       and t.is_house
  );
$is_house_member$;

grant  execute on function public.is_house_member() to authenticated;
revoke execute on function public.is_house_member() from public, anon;


-- ---------------------------------------------------------------------------
-- 3. consent_records
--
-- One row per submission, written by the discovery server action with the
-- service-role key at the moment of submitting. Counsel's field list, in
-- order: submission id, UTC timestamp, IP and user agent, tenant/partner,
-- Terms version date, Privacy version date, the exact consent text shown, the
-- value of each checkbox, and the phone number consented.
--
-- WHY submission_id HAS NO FOREIGN KEY
--
-- The privacy policy promises to delete an evaluation record within 30 days
-- of a request; counsel requires the consent record to survive six years.
-- A cascading FK would delete the proof of consent along with the lead, and a
-- restricting one would block the deletion the policy promises. So the id and
-- ref are copied, unconstrained, and the record outlives the submission.
-- tenant_id keeps its FK: tenants are suspended, never deleted.
--
-- The text columns are the whole sentences, not a version number. A version
-- string proves nothing if the code behind it is later edited in place; the
-- words themselves are what the visitor agreed to.
-- ---------------------------------------------------------------------------

create table if not exists public.consent_records (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null,
  submission_ref      bigint,
  consented_at        timestamptz not null default now(),
  ip_address          text,
  user_agent          text,
  tenant_id           uuid not null references public.tenants (id),
  -- The partner credited when the consent was given, as a name, so a later
  -- rename does not rewrite it. Null on Prime's own site.
  partner_name        text,
  terms_version       date not null,
  privacy_version     date not null,
  terms_text          text not null,
  terms_accepted      boolean not null,
  sms_text            text not null,
  sms_consented       boolean not null default false,
  sms_phone           text,
  submit_notice_text  text not null,
  -- The STOP side. Null while consent stands.
  sms_opted_out_at    timestamptz,
  sms_opt_out_source  text,
  sms_opted_out_by    uuid references public.profiles (id) on delete set null,

  -- Submit is disabled until the box is ticked and the server refuses it
  -- too; a row claiming otherwise is a bug, not a record.
  constraint consent_terms_accepted_chk check (terms_accepted),
  -- A call/text consent with no number covers nothing.
  constraint consent_sms_phone_chk
    check (not sms_consented or nullif(trim(sms_phone), '') is not null),
  constraint consent_opt_out_source_chk
    check (sms_opt_out_source is null or sms_opt_out_source in ('console', 'sms_reply'))
);

create index if not exists consent_records_submission_idx
  on public.consent_records (submission_id);

create index if not exists consent_records_tenant_time_idx
  on public.consent_records (tenant_id, consented_at desc);

-- A STOP applies to the NUMBER, across every lead that consented with it.
-- Last ten digits, so "+1 (210) 555-0100" and "2105550100" are one number.
create index if not exists consent_records_phone_idx
  on public.consent_records ((right(regexp_replace(sms_phone, '\D', '', 'g'), 10)))
  where sms_phone is not null;

comment on table public.consent_records is
  'Terms and call/text consent captured at each discovery submission. Kept '
  'six years (consent_records_retain_trg), outlives its submission by design, '
  'readable by Prime''s team only. See migration 0015.';

alter table public.consent_records enable row level security;

drop policy if exists consent_records_select on public.consent_records;
create policy consent_records_select on public.consent_records
  for select to authenticated
  using (
    public.is_house_member()
    and tenant_id in (select public.tenant_scope())
  );

-- Read-only to every client role. Inserts come from the server action with
-- the service-role key; the only update is record_sms_opt_out below.
revoke all on public.consent_records from public, anon, authenticated;
grant  select on public.consent_records to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Six-year retention, enforced by the database
--
-- A delete inside the window raises, whoever runs it, the service role
-- included. A retention promise kept only by convention is broken the first
-- time someone tidies the table.
-- ---------------------------------------------------------------------------

create or replace function public.consent_records_retain()
returns trigger
language plpgsql
as $consent_records_retain$
begin
  if old.consented_at > now() - interval '6 years' then
    raise exception
      'Consent records are kept for six years. This one was captured % and cannot be deleted before %.',
      old.consented_at, old.consented_at + interval '6 years'
      using errcode = '42501';
  end if;
  return old;
end;
$consent_records_retain$;

drop trigger if exists consent_records_retain_trg on public.consent_records;
create trigger consent_records_retain_trg
  before delete on public.consent_records
  for each row execute function public.consent_records_retain();


-- ---------------------------------------------------------------------------
-- 5. record_sms_opt_out: a STOP reaches the record
--
-- No SMS provider is wired up yet, so today a STOP arrives on whatever phone
-- the advisor texted from, and they record it from the lead page. When a
-- provider is added, its webhook calls this same function (source
-- 'sms_reply'), so there is one write path for opt-outs.
--
-- The opt-out applies to the number, not just the one lead: a person who
-- texts STOP has asked Prime to stop, and a second lead they submitted last
-- year is not an exception to that. Hence the update by normalised number
-- across every tenant, which is why this is SECURITY DEFINER rather than an
-- RLS update policy. The caller must still be on Prime's team and able to see
-- the lead they started from.
-- ---------------------------------------------------------------------------

create or replace function public.record_sms_opt_out(
  p_submission_id uuid,
  p_source        text default 'console'
)
returns integer
language plpgsql
security definer
set search_path = public
as $record_sms_opt_out$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_actor   text;
  v_count   integer;
begin
  if not public.is_house_member() then
    raise exception 'Only the Prime PEO Brokers team can record an opt-out.'
      using errcode = '42501';
  end if;
  if p_source not in ('console', 'sms_reply') then
    raise exception 'Unknown opt-out source: %', p_source using errcode = '22023';
  end if;

  select tenant_id
    into v_tenant
    from public.consent_records
   where submission_id = p_submission_id
     and tenant_id in (select public.tenant_scope())
   order by consented_at desc
   limit 1;

  if v_tenant is null then
    raise exception 'There is no consent record for that lead.' using errcode = 'P0002';
  end if;

  /*
    Every number the lead ever consented with, not just the latest record's.
    A lead can carry more than one consent record (a submit retried after the
    completion step failed writes a second), and reading only the newest one
    missed the number entirely whenever that newest record had none: the STOP
    then never reached the same number on the visitor's other leads. Only
    rows that carry a number are touched, so the count returned is the count
    of consents actually withdrawn.
  */
  update public.consent_records
     set sms_opted_out_at   = now(),
         sms_opt_out_source = p_source,
         sms_opted_out_by   = v_uid
   where sms_opted_out_at is null
     and sms_phone is not null
     and right(regexp_replace(sms_phone, '\D', '', 'g'), 10) in (
       select right(regexp_replace(c.sms_phone, '\D', '', 'g'), 10)
         from public.consent_records c
        where c.submission_id = p_submission_id
          and c.sms_phone is not null
          and regexp_replace(c.sms_phone, '\D', '', 'g') <> ''
     );
  get diagnostics v_count = row_count;

  select coalesce(full_name, email, 'staff') into v_actor
    from public.profiles where id = v_uid;

  -- Only when something changed, so a second click does not log twice.
  -- The submission may have been deleted on request while its consent record
  -- lives on (see section 3), so the event is written only if it still exists.
  if v_count > 0 and exists (select 1 from public.submissions where id = p_submission_id) then
    insert into public.submission_events (tenant_id, submission_id, actor, actor_id, action, detail)
    values (
      v_tenant, p_submission_id, coalesce(v_actor, 'system'), v_uid, 'sms_opt_out',
      'Calls and texts stopped (STOP recorded)'
    );
  end if;

  return v_count;
end;
$record_sms_opt_out$;

grant  execute on function public.record_sms_opt_out(uuid, text) to authenticated;
revoke execute on function public.record_sms_opt_out(uuid, text) from public, anon;


-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------

do $assert_0015$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'consent_records'
       and 'anon' = any (roles)
  ) then
    raise exception 'A policy on consent_records targets anon.';
  end if;

  if has_table_privilege('authenticated', 'public.consent_records', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consent_records', 'DELETE')
     or has_table_privilege('authenticated', 'public.consent_records', 'INSERT') then
    raise exception 'authenticated can write consent_records directly; only the opt-out RPC may.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'consent_records_retain_trg'
       and tgrelid = 'public.consent_records'::regclass
  ) then
    raise exception 'The six-year retention trigger is missing.';
  end if;
end $assert_0015$;
