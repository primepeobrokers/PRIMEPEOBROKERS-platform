-- ===========================================================================
-- 0016: calls-only consent
--
-- Client decision, 20 Oct 2026: Prime does not text clients. The step 6
-- consent now covers calls only (lib/legal.ts CONSENT_CALL_TEXT) and every
-- STOP/HELP path goes. In the database that means one thing: the 'sms_reply'
-- opt-out source, which existed only so a future SMS provider's STOP webhook
-- could call record_sms_opt_out, is removed. A visitor withdraws call consent
-- by telling their advisor or emailing Prime (privacy policy section 7), and
-- the advisor records it from the lead page, source 'console'.
--
-- WHAT IS DELIBERATELY NOT RENAMED: the sms_* columns and the function name.
-- consent_records already holds live rows (REF 1160 onward), the export and
-- the console read these names, and a rename buys nothing a comment does not.
-- sms_consented / sms_phone / sms_text hold the CALL consent from now on;
-- sms_text stores the exact wording shown, so each row says which consent it
-- records.
--
-- DEPLOY ORDER: none. The console passes only 'console', which this and 0015
-- both accept, so code and migration can ship in either order.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Only the console records an opt-out
-- ---------------------------------------------------------------------------

alter table public.consent_records
  drop constraint if exists consent_opt_out_source_chk;
alter table public.consent_records
  add constraint consent_opt_out_source_chk
    check (sms_opt_out_source is null or sms_opt_out_source = 'console');

comment on table public.consent_records is
  'Terms and call consent captured at each discovery submission (calls only '
  'from 2026-10-20; the sms_* columns hold the call consent). Kept six years '
  '(consent_records_retain_trg), outlives its submission by design, readable '
  'by Prime''s team only. See migrations 0015 and 0016.';


-- ---------------------------------------------------------------------------
-- 2. record_sms_opt_out: same behaviour, console only, call wording
--
-- Restated in full because `create or replace` needs the whole body. Changes
-- from 0015: the source check admits 'console' only, and the event written
-- to the lead's timeline says what is withdrawn now ("Call consent
-- withdrawn") instead of "Calls and texts stopped (STOP recorded)". The
-- signature is unchanged, so the console's call needs no edit.
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
  if p_source is distinct from 'console' then
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

  -- Every number the lead ever consented with, not just the latest record's:
  -- see 0015 for the retried-submit case this guards.
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

  if v_count > 0 and exists (select 1 from public.submissions where id = p_submission_id) then
    insert into public.submission_events (tenant_id, submission_id, actor, actor_id, action, detail)
    values (
      v_tenant, p_submission_id, coalesce(v_actor, 'system'), v_uid, 'sms_opt_out',
      'Call consent withdrawn'
    );
  end if;

  return v_count;
end;
$record_sms_opt_out$;

grant  execute on function public.record_sms_opt_out(uuid, text) to authenticated;
revoke execute on function public.record_sms_opt_out(uuid, text) from public, anon;
