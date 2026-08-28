-- Prime Vantage · Phase 1 schema
-- Multi-tenancy is designed in from the start: every submission, profile and
-- event carries a tenant_id even though only one tenant exists in Phase 1.
-- See docs/data-model.md for the decisions behind this file.

-- ---------------------------------------------------------------------------
-- Tenants (white-label partners in Phase 3; a single row in Phase 1)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,63}$'),
  name        text not null,
  -- logo, colour palette, company name, configurable without redeploy (Phase 3)
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- The Phase 1 tenant. Fixed UUID so application code and later migrations can
-- reference it deterministically.
insert into public.tenants (id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'prime-vantage', 'Prime Vantage');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user; roles become meaningful in Phase 2)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id),
  full_name   text,
  role        text not null default 'admin' check (role in ('admin', 'member')),
  created_at  timestamptz not null default now()
);

-- Every new auth user is attached to the Prime Vantage tenant in Phase 1.
-- Phase 2/3 invitation flows will set tenant_id explicitly instead.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, tenant_id, full_name)
  values (
    new.id,
    '00000000-0000-4000-8000-000000000001',
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Submissions (one per discovery-flow record, partial or complete)
-- ---------------------------------------------------------------------------
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id),
  -- Human-facing reference shown in the console and in emails. Global (not
  -- per-tenant) sequence. Documented trade-off in docs/data-model.md.
  ref             bigint generated always as identity (start with 1001) unique,
  status          text not null default 'partial' check (status in ('partial', 'complete')),
  -- Phase 2 lead pipeline. Stored as text (not an enum) so the stage list
  -- stays configurable without a migration.
  lead_stage      text not null default 'new',
  -- Highest step index (0-based) the visitor has completed. 6 = all done.
  steps_completed int not null default 0 check (steps_completed between 0 and 6),
  -- Every answer from all six steps, keyed by field id (see lib/discovery/schema.ts).
  answers         jsonb not null default '{}'::jsonb,
  -- Denormalised columns for the console list view (sort/search without
  -- digging into jsonb). Kept in sync by the application on every save.
  company_name    text,
  contact_name    text,
  contact_email   text,
  fte_count       int,
  benefits_spend  numeric,
  current_setup   text,
  -- Save-and-finish-later. The token is a capability: knowing it lets the
  -- visitor resume (and only resume) this one draft.
  resume_token    uuid not null default gen_random_uuid() unique,
  resume_email    text,
  source          text not null default 'discovery_flow',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_at    timestamptz
);

create index submissions_tenant_created_idx
  on public.submissions (tenant_id, created_at desc);
create index submissions_tenant_status_idx
  on public.submissions (tenant_id, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submissions_touch_updated_at
  before update on public.submissions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Submission events (record history in the detail view; grows into the
-- Phase 2 activity log)
-- ---------------------------------------------------------------------------
create table public.submission_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants (id),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  actor         text not null, -- 'client' for the visitor, otherwise a staff email
  action        text not null,
  detail        text,
  created_at    timestamptz not null default now()
);

create index submission_events_submission_idx
  on public.submission_events (submission_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- The anon role gets NO policies on any table: there is no public or
-- anonymous read path to submission data. The discovery flow writes through
-- server-only code using the service-role key. Authenticated staff read
-- strictly within their own tenant, enforced here at the data layer,
-- not in the UI.
-- ---------------------------------------------------------------------------
alter table public.tenants            enable row level security;
alter table public.profiles           enable row level security;
alter table public.submissions        enable row level security;
alter table public.submission_events  enable row level security;

-- security definer so profile lookups don't recurse through profiles' own RLS
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

revoke execute on function public.current_tenant_id() from anon;

create policy "members read their tenant"
  on public.tenants for select
  to authenticated
  using (id = public.current_tenant_id());

create policy "members read profiles in their tenant"
  on public.profiles for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "members read their tenant's submissions"
  on public.submissions for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "members update their tenant's submissions"
  on public.submissions for update
  to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "members read their tenant's events"
  on public.submission_events for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "members write events in their tenant"
  on public.submission_events for insert
  to authenticated
  with check (tenant_id = public.current_tenant_id());
