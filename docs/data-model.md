# Phase 1 data model: decisions and rationale

Phases 2 and 3 build directly on these decisions. Read this before touching
the schema. The schema itself lives in `supabase/migrations/0001_init.sql`.

## Multi-tenancy is in from day one

Every domain table (`submissions`, `profiles`, `submission_events`) carries a
`tenant_id` referencing `tenants`. Phase 1 seeds exactly one tenant:

- **Prime PEO Brokers**, fixed id `00000000-0000-4000-8000-000000000001`
  (constant `DEFAULT_TENANT_ID` in `lib/tenant.ts`).

Phase 3 partners become additional `tenants` rows. `tenants.branding` (jsonb)
is reserved for per-partner logo/palette/company-name so branding changes need
no redeploy. The only Phase 1 code that assumes a single tenant is the
discovery flow's use of `DEFAULT_TENANT_ID`. In Phase 3 that call site
resolves the tenant from the request's subdomain instead.

## Tenant isolation is enforced at the data layer

- RLS is enabled on all four tables.
- The **anon role has no policies at all**: there is no public or anonymous
  read path to submission data, and no Supabase query runs from the browser.
- Authenticated staff read/update only rows where
  `tenant_id = current_tenant_id()` (a `security definer` helper that looks up
  the caller's profile). A partner login in Phase 3 gets isolation for free.
- The discovery flow writes through **server-only** code
  (`app/discovery/actions.ts`) using the service-role key. That code guards
  every mutation with the draft's `(id, resume_token)` pair.

## Submissions

One row per discovery record, partial or complete.

- **All answers live in `answers` (jsonb)**, keyed by the field ids defined in
  `lib/discovery/schema.ts` (the single source of truth for the six steps,
  their fields, and validation). A schema change is a code change, not a
  migration. Deliberate, because the client may tune questions.
- **Denormalised columns** (`company_name`, `contact_name`, `contact_email`,
  `fte_count`, `benefits_spend`, `current_setup`) are synced by the app on
  every save so the console can sort/search/filter without jsonb gymnastics.
  `answers` remains authoritative; the columns are projections.
- **Partial submissions are first-class**: the row is created the moment step 1
  is completed, `status = 'partial'`, `steps_completed` tracks progress. Final
  submit revalidates everything server-side and flips `status = 'complete'`.
- **`resume_token`** is a database-generated UUID capability: whoever holds it
  can resume (and only resume) that one draft. It is handed to the creating
  browser and emailed on request ("finish later"). It is never enumerable.
- **`ref`** is a global (not per-tenant) identity starting at 1001. The
  human-facing number in the console and emails. Trade-off: partners in
  Phase 3 will see non-contiguous refs. Accepted; a per-tenant display number
  can be layered on later without touching this column.
- **`lead_stage`** exists now (default `'new'`) but is unused until Phase 2.
  It is plain text, not an enum, because the SOW requires the stage list to be
  configurable rather than hard-coded.

## Profiles and roles

`profiles` is keyed by the Supabase auth user id. A trigger creates the row on
signup/invite and attaches it to the Prime PEO Brokers tenant. `role` is
`admin | member`, present now so Phase 2 permissions do not need a backfill,
but Phase 1 treats everyone the same.

## Events

`submission_events` records the visible history (submitted, record opened) and
grows into the Phase 2 activity log ("who changed what and when"). Append-only
from the app; no update/delete policies exist.

## Data-handling requirements → where they are met

| Requirement | Where |
| --- | --- |
| Encrypted at rest | Supabase Postgres encrypts all data at rest (AES-256); TLS in transit |
| No public/anonymous read paths | No anon RLS policies; no client-side Supabase queries; console routes behind auth (proxy + per-page checks) |
| Not exposed via bundles/endpoints | Service-role key is server-only (`lib/supabase/admin.ts`, `server-only` import); submission reads happen in Server Components/route handlers that require a session |
| Server-side tenant isolation | RLS policies on `tenant_id`, not UI filtering |
