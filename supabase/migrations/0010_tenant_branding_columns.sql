-- ===========================================================================
-- 0010 · Phase 3: the operational columns on tenants
--
-- WHY THIS IS A SEPARATE FILE FROM 0009
--
-- It should not have been. These columns belong with the rest of the Phase 3
-- foundation, and 0009 was written without them: lib/tenant/resolve.ts selects
-- "id, slug, name, branding, is_house, suspended_at" and two of those columns
-- did not exist, so EVERY tenant lookup failed with a PostgREST 42703 and
-- getTenant() returned null, which 404s the portal and falls the discovery
-- flow back to the house tenant. 0009 is already applied to production, so the
-- fix is a new file rather than an edit to a migration that has run.
--
-- DELIBERATELY ABSENT: any policy granting `anon` select on public.tenants.
--
-- A public partner landing page needs its own branding before anyone signs in,
-- and `anon` has no policy on any table (the stance since 0001). The obvious
-- fix is a `to anon` select policy here. It would be a mistake: the anon key
-- is NEXT_PUBLIC_ and ships in every client bundle, so that policy makes the
-- client's ENTIRE PARTNER ROSTER enumerable with one unauthenticated request:
--
--     GET /rest/v1/tenants?select=slug,name
--
-- Column grants do not help, because the row SET is what leaks. So branding is
-- read server-side with the service-role client against an explicit column
-- allowlist. See lib/tenant/resolve.ts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. is_house: which tenant is Prime PEO Brokers itself
--
-- Phase 3 makes "the tenant on the apex" a distinguishable thing rather than
-- an assumption. requireStaff() gates the console on it, TenantMark decides
-- whether the traced brand-guide cube may render, and tenantOrigin() decides
-- whether to build an apex URL or a subdomain one.
--
-- A column rather than "id = the founding uuid" hardcoded in five places,
-- because the house tenant is a role a row plays, not a magic constant. The
-- code still falls back to treating the apex as house when the column reads
-- null, so a half-applied schema cannot turn the marketing site into a portal.
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists is_house boolean not null default false;

update public.tenants
   set is_house = true
 where id = '00000000-0000-4000-8000-000000000001'
   and is_house = false;

-- Exactly one house tenant, enforced structurally. A second one would make
-- "the apex tenant" ambiguous and tenantOrigin() non-deterministic.
-- Partial unique index on a constant: the standard way to say "at most one
-- row where this is true".
create unique index if not exists tenants_one_house
  on public.tenants ((true))
  where is_house;

comment on column public.tenants.is_house is
  'True for Prime PEO Brokers'' own tenant, false for every partner. At most '
  'one row (tenants_one_house). Gates the staff console and the brand-guide '
  'logo. See migration 0010.';


-- ---------------------------------------------------------------------------
-- 2. suspended_at: stop a partner without deleting anything
--
-- Ending a partner relationship must not mean deleting the tenant row: their
-- submissions, notes and events all reference it, and the leads themselves
-- stay commercially valuable to the client (they did the work on them).
--
-- lib/tenant/resolve.ts treats a suspended tenant as absent, so the subdomain
-- 404s while every row survives. Reversible by setting it back to null.
--
-- Note what this does NOT do: it does not revoke a partner user's data access.
-- That is deactivated_at on their profile, which tenant_scope() filters. A
-- suspended tenant whose users are still active would still serve them data
-- through PostgREST, so suspending a partner means doing both.
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists suspended_at timestamptz;

comment on column public.tenants.suspended_at is
  'Non-null suspends the portal: resolve.ts treats the tenant as absent so the '
  'subdomain 404s, while every referencing row survives. Does NOT revoke user '
  'data access on its own: deactivate their profiles too. See migration 0010.';


-- ---------------------------------------------------------------------------
-- 3. updated_at, so a branding change is visible
--
-- The tenant lookup is cached for five minutes (unstable_cache in
-- resolve.ts). When the admin branding form lands it will invalidate by tag,
-- but a timestamp makes "did my change take effect" answerable from the
-- database rather than by guessing at cache state.
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists updated_at timestamptz not null default now();

-- touch_updated_at already exists from 0001, where it serves submissions.
do $tenants_touch$
begin
  if exists (
    select 1 from pg_proc
     where proname = 'touch_updated_at'
       and pronamespace = 'public'::regnamespace
  ) and not exists (
    select 1 from pg_trigger
     where tgname = 'tenants_touch_updated_at_trg'
       and tgrelid = 'public.tenants'::regclass
  ) then
    create trigger tenants_touch_updated_at_trg
      before update on public.tenants
      for each row execute function public.touch_updated_at();
  end if;
end $tenants_touch$;


-- ---------------------------------------------------------------------------
-- 4. branding must be a JSON object
--
-- The column has existed since 0001 with a `'{}'::jsonb` default, but nothing
-- constrained its SHAPE: a jsonb array or a bare scalar would satisfy the
-- type. parseBranding() already degrades safely on those (it checks for a
-- non-array object and falls back to house defaults rather than throwing),
-- but a write that cannot be read back correctly should be rejected at the
-- point of writing.
--
-- Only the top-level shape is constrained. Per-field validation stays in
-- lib/tenant/branding.ts, deliberately: a CHECK over jsonb keys is
-- unmaintainable, and more importantly a bad COLOUR must degrade to the house
-- token rather than block the write and 500 a partner's portal. The colour
-- allowlist there is also a CSS-injection boundary, which a database
-- constraint is the wrong place to enforce.
-- ---------------------------------------------------------------------------

alter table public.tenants
  drop constraint if exists tenants_branding_is_object;

alter table public.tenants
  add constraint tenants_branding_is_object
  check (jsonb_typeof(branding) = 'object')
  not valid;

-- Separate statement: validate takes only SHARE UPDATE EXCLUSIVE and does not
-- block reads. Every existing row is '{}' so this is instant.
alter table public.tenants
  validate constraint tenants_branding_is_object;

comment on column public.tenants.branding is
  'Per-partner logo, palette and display name. Shape is the Branding type in '
  'lib/tenant/branding.ts; unknown keys are ignored and invalid values fall '
  'back to the house token. Read SERVER-SIDE ONLY: anon has no policy on this '
  'table on purpose, because one would make the partner roster enumerable. '
  'See migration 0010.';


-- ---------------------------------------------------------------------------
-- 5. Partner isolation needs no new policy, and that is the point
--
-- A partner login inherits isolation from work already done: every policy
-- routes through tenant_scope() (0009), which returns exactly one tenant for
-- a profile whose is_platform_staff is false, and handle_new_user has read
-- tenant_id from invite metadata since 0007. So provisioning a partner is
-- three inserts and no schema change.
--
-- This note exists so the next reader does not go looking for the missing
-- partner policies. 0005 predicted this: "A partner login in Phase 3 gets
-- isolation for free."
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------

do $assert_0010$
declare
  v_house integer;
begin
  -- The columns resolve.ts selects must all exist, or every tenant lookup
  -- fails with a 42703 and getTenant() returns null: a 404 on every partner
  -- portal. This is the exact bug 0010 exists to fix, so assert it is fixed.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tenants'
       and column_name = 'is_house'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tenants'
       and column_name = 'suspended_at'
  ) then
    raise exception
      'tenants is missing is_house or suspended_at; TENANT_SELECT in lib/tenant/resolve.ts would fail on every request.';
  end if;

  select count(*) into v_house from public.tenants where is_house;
  if v_house <> 1 then
    raise exception
      'Expected exactly one house tenant, found %. tenantOrigin() would be non-deterministic.',
      v_house;
  end if;

  -- anon still gets nothing, here or anywhere.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'tenants' and 'anon' = any (roles)
  ) then
    raise exception
      'A policy on tenants targets anon. That makes the partner roster enumerable with the NEXT_PUBLIC_ key.';
  end if;
end $assert_0010$;
