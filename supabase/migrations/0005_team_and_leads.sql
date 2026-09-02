-- Prime PEO Brokers · Phase 2: team accounts and lead management
--
-- Phase 1 shipped capture: every discovery submission is stored and readable.
-- This migration adds the data layer for working those leads: staff accounts
-- with real roles, assignment, a configurable stage pipeline, internal notes
-- kept as history, and an activity log that answers "who changed what, when".
--
-- Read docs/data-model.md first. Phase 1 anticipated most of this on purpose:
-- submissions.lead_stage, profiles.role and submission_events all exist
-- already, so there is nothing to backfill. What is new here is three tables
-- (lead_stages, submission_notes, tenant_events), two columns on submissions,
-- one on submission_events, and the role plumbing that makes profiles.role
-- mean something.
--
-- Two design stances carried over from 0001 and worth stating up front:
--
--   1. Tenant isolation lives at the data layer, never in the UI. Every new
--      table carries tenant_id and every policy routes through
--      current_tenant_id(), so Phase 3 partner logins inherit isolation for
--      free rather than needing a second implementation.
--
--   2. History is append-only. Notes and events get select and insert
--      policies and nothing else. A history a participant can rewrite is not
--      a history, and the SOW asks for notes "retained as a history".
--
-- Written to be safely re-runnable.


-- ===========================================================================
-- 0. Make the authenticated EXECUTE grant on current_tenant_id() explicit
--
-- Every RLS policy in 0001 calls current_tenant_id(). Postgres evaluates
-- USING and WITH CHECK expressions with the privileges of the QUERYING role,
-- so a signed-in user needs EXECUTE on that function in their own right.
-- SECURITY DEFINER governs what the function body may do; it does not grant
-- anyone the right to call it.
--
-- Today that grant comes from Supabase's default privileges on the public
-- schema, which grant authenticated directly at function-creation time. So
-- 0004's "revoke ... from public, anon" left it intact and the console works.
--
-- It is restated explicitly here because default privileges only ever apply
-- at CREATE time. If a future migration drops and recreates this function
-- rather than replacing it, default privileges fire again and silently
-- re-grant anon along with everyone else. An explicit grant plus an explicit
-- revoke makes the intended end state readable in one place instead of being
-- an emergent property of three migrations and a platform default.
--
-- The same hazard applies to the throttle functions locked down in 0004:
-- changing any argument type there creates a new, fully granted overload
-- while the locked-down original lingers. Those revokes stay as they are.
-- ===========================================================================

grant execute on function public.current_tenant_id() to authenticated;
revoke execute on function public.current_tenant_id() from public, anon;


-- ===========================================================================
-- 1. Profiles: deactivation, an honest role default, and the escalation guard
--
-- This comes before the identity helpers in section 2 on purpose. Postgres
-- parses and validates a function body at CREATE time, so
-- current_user_role(), which reads profiles.deactivated_at, cannot be defined
-- until that column exists. Defining the helpers first fails with
-- 'column "deactivated_at" does not exist'.
-- ===========================================================================

alter table public.profiles
  -- Removing a teammate is a soft delete. Hard-deleting the profile row
  -- leaves an orphan in auth.users who can still sign in, and
  -- handle_new_user's "on conflict (id) do nothing" would not recreate the
  -- profile, so they would land in the console with no tenant and every RLS
  -- check silently returning nothing. Worse, deleting the row erases their
  -- name from every note and event they ever wrote.
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles (id) on delete set null,
  add column if not exists invited_by     uuid references public.profiles (id) on delete set null,
  -- The invited address. profiles has no email column in 0001 (the console
  -- reads user.email off the session instead), but the team screen has to
  -- list people who have been invited and never signed in, and an assignee
  -- picker needs addresses for people other than the caller. Reading
  -- auth.users during a page render would mean the service-role key on a
  -- read path, which we do not want.
  add column if not exists email          text;

-- New accounts are members. 0001 defaulted to 'admin' because Phase 1 treated
-- everyone identically and the seeded staff were all admins. Left alone, that
-- default is a privilege escalation the moment invitations exist: everyone
-- invited would arrive able to manage the team.
alter table public.profiles
  alter column role set default 'member';

-- Existing rows are deliberately NOT rewritten to 'member'. The accounts that
-- exist today are the client's real administrators, and demoting them would
-- lock the tenant out of the very screen that fixes roles, with no in-app
-- recovery path.
do $$
declare
  v_admins integer;
begin
  select count(*) into v_admins
    from public.profiles
   where tenant_id = '00000000-0000-4000-8000-000000000001'
     and role = 'admin'
     and deactivated_at is null;

  if v_admins = 0 then
    raise notice 'No active admin on the Prime PEO Brokers tenant. Promote one before the team screen ships, or it will be unreachable.';
  end if;
end $$;

-- Column-level lockdown, belt and braces alongside the RPCs in section 8.
--
-- There is no UPDATE policy on profiles today, so this changes nothing right
-- now. It exists for the day someone adds the obvious-looking
--     create policy "users update own profile" on public.profiles
--       for update to authenticated using (id = auth.uid());
-- which would let any member set their own role to 'admin', because RLS has
-- no per-column granularity: "update my full_name" and "update my role" are
-- the same row-level operation. With these grants in place, that policy still
-- cannot reach role, tenant_id or deactivated_at.
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

comment on column public.profiles.deactivated_at is
  'Set by remove_teammate(). Non-null means no access: current_user_role() returns null.';
comment on column public.profiles.email is
  'Snapshot of the invited address, so the team screen can list invitees without reading auth.users.';


-- ===========================================================================
-- 2. Caller identity helpers
--
-- Both are SECURITY DEFINER for the reason given in 0001: a function that
-- reads public.profiles, called from a policy ON public.profiles, recurses
-- through that policy and errors with "infinite recursion detected in policy
-- for relation profiles".
--
-- Both are granted to authenticated explicitly rather than relying on the
-- platform default, per section 0. They read the columns added in section 1.
-- ===========================================================================

-- 'admin' or 'member' for the caller, null when unauthenticated OR removed.
--
-- Returning null for a deactivated teammate is the load-bearing part: it is
-- checked here, once, rather than in each policy, so one forgotten policy
-- cannot leave a removed person with working access until their JWT expires.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.profiles
   where id = auth.uid()
     and deactivated_at is null
$$;

-- Convenience predicate, so policies read as English and the admin test lives
-- in exactly one place.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

grant  execute on function public.current_user_role() to authenticated;
grant  execute on function public.is_admin()          to authenticated;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin()          from public, anon;


-- ===========================================================================
-- 3. Lead stages: per-tenant, admin-configurable at runtime
--
-- A table rather than a config file because the SOW requires the client to
-- add, rename, reorder and retire stages without a developer. Per-tenant from
-- the start, because Phase 3 partners will each want their own pipeline.
--
-- The slug/label split is the important decision here. slug is the immutable
-- machine identity that submissions.lead_stage points at; label is what the
-- UI renames. So renaming "Contacted" to "Reached out" relabels every lead
-- instantly, rewrites no submission rows, and leaves ?stage=contacted links
-- working. Renames are the common operation, so they must be the cheap one.
-- ===========================================================================

create table if not exists public.lead_stages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  -- Immutable, enforced by the guard trigger below rather than left to
  -- convention. An UPDATE of slug would have to cascade to every submission
  -- on that stage; making it impossible is simpler than making it correct.
  slug         text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  label        text not null check (length(trim(label)) between 1 and 60),
  -- Reordering is an UPDATE of this column. Deliberately NOT unique per
  -- tenant: the UI renumbers every stage in one statement, and a unique
  -- constraint fails on the intermediate collisions a bulk renumber passes
  -- through. Ties break on slug, so the order stays deterministic.
  sort_order   int  not null default 0,
  -- Where new submissions land. At most one non-retired default per tenant,
  -- enforced by the partial unique index below.
  is_default   boolean not null default false,
  -- "Worked to conclusion": excluded from the open pipeline, stamps
  -- submissions.closed_at. A flag rather than a hardcoded slug = 'closed'
  -- test, so a tenant can run both "closed won" and "closed lost".
  is_terminal  boolean not null default false,
  -- Badge colourway. Constrained to the four status variants that exist in
  -- app/components/ui/badge.tsx, backed by --pv-tone-* tokens in globals.css.
  -- Not a hex column: the brand rule is that colours are defined once as
  -- tokens, so an admin picks a role ("Attention") and never a colour.
  tone         text not null default 'neutral'
                 check (tone in ('positive', 'warning', 'accent', 'neutral')),
  -- Retiring is not deleting. A lead may be sitting on this stage and the
  -- activity log references it by slug, so the row has to stay readable.
  -- The FK from submissions is ON DELETE RESTRICT, which would refuse the
  -- delete anyway.
  retired_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Target of the composite FK from submissions. Composite on
  -- (tenant_id, slug) rather than unique on slug alone: in Phase 3 two
  -- partners must both be allowed a stage called 'closed', and routing the FK
  -- through tenant_id makes it structurally impossible to put one tenant's
  -- stage on another tenant's lead. No application check can be forgotten.
  constraint lead_stages_tenant_slug_key unique (tenant_id, slug)
);

-- At most one default per tenant among live stages. Partial on retired_at so
-- a retired ex-default does not block naming a replacement.
create unique index if not exists lead_stages_one_default_idx
  on public.lead_stages (tenant_id)
  where is_default and retired_at is null;

create index if not exists lead_stages_tenant_order_idx
  on public.lead_stages (tenant_id, sort_order, slug)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- Stage invariants that the application must not be trusted with.
--
-- The failure this prevents: an admin on the settings screen retires stages
-- one at a time until none are left, or retires the default. Every subsequent
-- submission then fails the composite FK on insert, and the discovery flow
-- returns "Saving failed" to every visitor. A settings screen must not be
-- able to take the public funnel offline.
-- ---------------------------------------------------------------------------
create or replace function public.lead_stages_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_live integer;
begin
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    raise exception 'lead_stages.slug is immutable; rename the label instead (slug %)', old.slug;
  end if;

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'lead_stages.tenant_id is immutable';
  end if;

  -- A retired stage can never also be the default, in either order of edits.
  if new.is_default and new.retired_at is not null then
    raise exception 'A retired stage cannot be the default stage.';
  end if;

  -- Retiring: never the default, never the last one standing.
  if new.retired_at is not null and (tg_op = 'INSERT' or old.retired_at is null) then
    if new.is_default then
      raise exception 'Cannot retire the default stage. Make another stage the default first.';
    end if;

    select count(*) into v_live
      from public.lead_stages
     where tenant_id = new.tenant_id
       and retired_at is null
       and id <> new.id;

    if v_live = 0 then
      raise exception 'Cannot retire the last remaining stage for this tenant.';
    end if;
  end if;

  return new;
end;
$$;

-- create trigger has no "if not exists" clause, so guard on the catalog.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'lead_stages_guard_trg'
       and tgrelid = 'public.lead_stages'::regclass
  ) then
    create trigger lead_stages_guard_trg
      before insert or update on public.lead_stages
      for each row execute function public.lead_stages_guard();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'lead_stages_touch_updated_at'
       and tgrelid = 'public.lead_stages'::regclass
  ) then
    create trigger lead_stages_touch_updated_at
      before update on public.lead_stages
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed the four stages named in the SOW, for the existing tenant.
--
-- on conflict do nothing, so re-running this migration never resets labels,
-- ordering or tones the client has since tuned through the admin screen.
-- That is the point of re-runnability: safe against a database someone has
-- already been using.
-- ---------------------------------------------------------------------------
insert into public.lead_stages
  (tenant_id, slug, label, sort_order, is_default, is_terminal, tone)
values
  ('00000000-0000-4000-8000-000000000001', 'new',         'New',         10, true,  false, 'neutral'),
  ('00000000-0000-4000-8000-000000000001', 'in-progress', 'In progress', 20, false, false, 'accent'),
  ('00000000-0000-4000-8000-000000000001', 'contacted',   'Contacted',   30, false, false, 'warning'),
  ('00000000-0000-4000-8000-000000000001', 'closed',      'Closed',      40, false, true,  'positive')
on conflict (tenant_id, slug) do nothing;

comment on column public.lead_stages.slug is
  'Immutable machine identity. submissions.lead_stage points here; renames happen on label.';
comment on column public.lead_stages.tone is
  'Badge variant name from app/components/ui/badge.tsx. Never a colour value.';


-- ===========================================================================
-- 4. Submissions: assignment, the stage FK, and a closure stamp
-- ===========================================================================

alter table public.submissions
  -- Nullable, because unassigned is a normal and common state that the
  -- console surfaces as its own queue. ON DELETE SET NULL because removing a
  -- teammate must never delete, hide or block a lead.
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists assigned_at timestamptz,
  -- Stamped by the trigger in section 6 when a lead reaches a terminal stage,
  -- cleared when it leaves one. Denormalised from the event log so
  -- "closed this month" is an index scan and not a log aggregation.
  add column if not exists closed_at   timestamptz;

-- ---------------------------------------------------------------------------
-- Reconcile lead_stage with the stage table before adding the FK.
--
-- 0001 gave lead_stage "default 'new'" with no check and no FK, and no
-- application code has ever written to it, so every existing row should read
-- 'new'. Should is not is: anything unexpected is moved to the tenant's
-- default rather than letting the ALTER fail partway through a deploy.
-- ---------------------------------------------------------------------------
update public.submissions s
   set lead_stage = d.slug
  from public.lead_stages d
 where d.tenant_id = s.tenant_id
   and d.is_default
   and d.retired_at is null
   and not exists (
     select 1 from public.lead_stages t
      where t.tenant_id = s.tenant_id
        and t.slug = s.lead_stage
   );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_lead_stage_fkey'
  ) then
    -- ON UPDATE CASCADE is a safety net, not a feature: the guard trigger
    -- makes slug immutable, so it should never fire. If some future migration
    -- genuinely must rewrite a slug, the leads follow instead of the
    -- statement erroring.
    --
    -- ON DELETE RESTRICT is the real protection: deleting a stage that still
    -- holds leads is impossible, which is why retiring exists at all.
    alter table public.submissions
      add constraint submissions_lead_stage_fkey
      foreign key (tenant_id, lead_stage)
      references public.lead_stages (tenant_id, slug)
      on update cascade
      on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Resolve the tenant's real default stage on insert.
--
-- THIS TRIGGER SITS ON THE REVENUE PATH. app/discovery/actions.ts inserts a
-- draft without naming lead_stage and relies on the column default, so this
-- runs for every visitor who starts the discovery flow. It degrades through
-- fallbacks rather than raising, because a stage misconfiguration must never
-- turn into "Saving failed" for a real lead.
--
-- The 0001 column default of 'new' is kept as the last line of defence, but
-- it is not sufficient on its own: a Phase 3 partner tenant may have no stage
-- called 'new' at all, and the composite FK would then reject every
-- submission for that tenant. This trigger is the actual guarantee.
-- ---------------------------------------------------------------------------
create or replace function public.submissions_default_stage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_slug text;
begin
  -- An explicit, valid stage from the caller is always honoured.
  if exists (
    select 1 from public.lead_stages
     where tenant_id = new.tenant_id
       and slug = new.lead_stage
  ) then
    return new;
  end if;

  select slug into v_slug
    from public.lead_stages
   where tenant_id = new.tenant_id
     and is_default
     and retired_at is null;

  if v_slug is null then
    -- No default configured. Reached only if the partial unique index somehow
    -- holds no default row, which the guard trigger makes hard. A slightly
    -- wrong stage beats a lost lead.
    select slug into v_slug
      from public.lead_stages
     where tenant_id = new.tenant_id
       and retired_at is null
     order by sort_order, slug
     limit 1;
  end if;

  if v_slug is null then
    -- Nothing configured at all. The FK would reject this row anyway; raising
    -- here at least names the cause instead of surfacing a constraint code.
    raise exception 'Tenant % has no lead stages configured; cannot accept a submission.', new.tenant_id;
  end if;

  new.lead_stage := v_slug;
  return new;
end;
$$;

-- Stamp closed_at when a row is INSERTED straight onto a terminal stage.
--
-- The update trigger in section 6 owns this for stage transitions, but it
-- never sees an insert, so a lead created directly as closed (an import, or a
-- future bulk load) would carry a terminal stage with a null closed_at and
-- drop out of every "closed this month" count. Nothing does this today; it is
-- two lines to make the column's meaning hold regardless of write path.
create or replace function public.submissions_stamp_closed_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.closed_at is null and exists (
    select 1 from public.lead_stages
     where tenant_id = new.tenant_id
       and slug = new.lead_stage
       and is_terminal
  ) then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

-- Trigger names carry an explicit ordering prefix here, because these two
-- must fire in sequence: the second reads the lead_stage the first resolves,
-- and Postgres orders BEFORE row triggers alphabetically by name.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'submissions_10_default_stage_trg'
       and tgrelid = 'public.submissions'::regclass
  ) then
    create trigger submissions_10_default_stage_trg
      before insert on public.submissions
      for each row execute function public.submissions_default_stage();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'submissions_20_stamp_closed_trg'
       and tgrelid = 'public.submissions'::regclass
  ) then
    create trigger submissions_20_stamp_closed_trg
      before insert on public.submissions
      for each row execute function public.submissions_stamp_closed_on_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes, following the (tenant_id, ...) leading-column convention from
-- submissions_tenant_status_idx (0001) and submissions_tenant_category_idx
-- (0002): every console query is already tenant-filtered through RLS, so
-- tenant_id first is what makes an index usable at all.
-- ---------------------------------------------------------------------------

-- Stage filter on the leads list.
create index if not exists submissions_tenant_stage_idx
  on public.submissions (tenant_id, lead_stage);

-- The list view filters by stage and sorts by date. Postgres cannot satisfy
-- that ORDER BY from the two-column index above, so it would sort the whole
-- matching set; this one covers the real query shape.
create index if not exists submissions_tenant_stage_created_idx
  on public.submissions (tenant_id, lead_stage, created_at desc);

-- "My leads" for a signed-in teammate.
create index if not exists submissions_tenant_assigned_idx
  on public.submissions (tenant_id, assigned_to, created_at desc);

-- The unassigned queue. Partial, because it is a small and shrinking slice of
-- a table where most rows eventually have an owner.
create index if not exists submissions_tenant_unassigned_idx
  on public.submissions (tenant_id, created_at desc)
  where assigned_to is null;

comment on column public.submissions.lead_stage is
  'Slug into lead_stages for this tenant. Text, not an enum or uuid, so the list stays configurable and filter URLs stay readable.';
comment on column public.submissions.assigned_to is
  'Owning teammate, null when unassigned. Set null on profile delete: removing a person never removes a lead.';


-- ===========================================================================
-- 5. Internal notes, retained as history
--
-- Append-only: select and insert policies only, matching the stance 0001 took
-- for submission_events. The SOW calls for notes "retained as a history", and
-- a history a participant can quietly rewrite is not one.
--
-- If the client later asks for edit or unsend, the correct shape is a NEW
-- append-only row (kind = 'retraction') referencing the original, which is
-- why that column exists now. Adding
--     create policy ... for update using (author_id = auth.uid())
-- would look like the small obvious fix and would remove the guarantee.
-- ===========================================================================

create table if not exists public.submission_notes (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants (id),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  -- ON DELETE SET NULL so removing a teammate never deletes their notes and
  -- is never blocked by them.
  author_id     uuid references public.profiles (id) on delete set null,
  -- The author's name as it stood when the note was written. This is the one
  -- correct denormalisation in this migration: it is a historical fact, not a
  -- projection of a live row. Without it, removing a teammate blanks the
  -- authorship on years of notes and the history stops answering "who".
  author_name   text not null,
  body          text not null check (length(trim(body)) between 1 and 8000),
  kind          text not null default 'note' check (kind in ('note', 'retraction')),
  -- Set only on kind = 'retraction': the note being withdrawn. The original
  -- stays in place and both render.
  retracts_id   bigint references public.submission_notes (id) on delete set null,
  created_at    timestamptz not null default now(),

  -- A retraction must name its target; a plain note must not.
  constraint submission_notes_retraction_target_chk check (
    (kind = 'retraction' and retracts_id is not null)
    or (kind = 'note' and retracts_id is null)
  )
);

-- Same shape as submission_events_submission_idx: the detail view reads one
-- submission's notes, newest first.
create index if not exists submission_notes_submission_idx
  on public.submission_notes (submission_id, created_at desc);

comment on table public.submission_notes is
  'Append-only internal notes. No update or delete policy by design; withdraw via a kind = retraction row.';


-- ===========================================================================
-- 6. Activity log: reliable attribution, and who does the writing
--
-- Split along one clear line:
--
--   Row state (lead_stage, assigned_to) is logged by a TRIGGER. There are
--   already three write paths into submissions (the session client through
--   RLS, the service-role client in the discovery flow, and whatever bulk
--   action the console grows next). Application-side logging has to be
--   repeated at each one and will drift, and a stage change that produced no
--   event is exactly the gap the SOW's "who changed what and when" exists to
--   close.
--
--   Intent (opened, submitted, exported) stays application-written. A trigger
--   cannot observe a read or an email send.
-- ===========================================================================

alter table public.submission_events
  -- Reliable attribution. actor stays exactly as it is: it is NOT NULL, it
  -- carries 'client' for the unauthenticated visitor who has no profile and
  -- never will, and it survives as the readable fallback after a profile is
  -- deleted and actor_id goes null.
  add column if not exists actor_id uuid references public.profiles (id) on delete set null;

-- Backfill attribution where the free-text actor unambiguously matches one
-- profile in the same tenant. Ambiguous or unmatched rows keep actor_id null
-- and their original text, which is the honest answer. This matches nothing
-- until profiles.email is populated by the invite flow; it is here because it
-- is free and correct once addresses exist.
update public.submission_events e
   set actor_id = p.id
  from public.profiles p
 where e.actor_id is null
   and p.tenant_id = e.tenant_id
   and p.email is not null
   and lower(p.email) = lower(e.actor);

create index if not exists submission_events_actor_idx
  on public.submission_events (tenant_id, actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The state-change logger. Three details that matter:
--
--   1. "is not distinct from" rather than "=". submissions_touch_updated_at
--      fires on every update, including ones touching neither column, and
--      "old.assigned_to <> new.assigned_to" evaluates to NULL (not false)
--      when either side is null. With "=" this trigger would emit nothing
--      when a lead is assigned for the first time, which is the single most
--      important assignment event there is.
--
--   2. auth.uid() is null under the service-role client, and that is correct.
--      A discovery-flow write is not attributable to a person, so it logs
--      actor = 'system' with actor_id = null rather than inventing an actor.
--
--   3. SECURITY DEFINER so the profile lookup is not filtered by the profiles
--      RLS policy, which would return nothing for a service-role caller.
-- ---------------------------------------------------------------------------
create or replace function public.submissions_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_actor_id  uuid;
  v_actor     text;
  v_old_label text;
  v_new_label text;
  v_old_name  text;
  v_new_name  text;
  v_terminal  boolean;
begin
  if v_uid is not null then
    select id, coalesce(full_name, email, 'staff')
      into v_actor_id, v_actor
      from public.profiles
     where id = v_uid;
  end if;

  v_actor := coalesce(v_actor, 'system');

  -- Stage change.
  if new.lead_stage is not distinct from old.lead_stage then
    -- Unchanged: nothing to log.
    null;
  else
    select label into v_old_label
      from public.lead_stages
     where tenant_id = old.tenant_id and slug = old.lead_stage;
    select label, is_terminal into v_new_label, v_terminal
      from public.lead_stages
     where tenant_id = new.tenant_id and slug = new.lead_stage;

    -- Stamp or clear the closure time as the lead crosses a terminal stage.
    if coalesce(v_terminal, false) then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;

    insert into public.submission_events
      (tenant_id, submission_id, actor, actor_id, action, detail)
    values (
      new.tenant_id, new.id, v_actor, v_actor_id, 'stage_changed',
      format('Stage: %s to %s',
             coalesce(v_old_label, old.lead_stage),
             coalesce(v_new_label, new.lead_stage))
    );
  end if;

  -- Assignment change.
  if new.assigned_to is not distinct from old.assigned_to then
    null;
  else
    select coalesce(full_name, email) into v_old_name
      from public.profiles where id = old.assigned_to;
    select coalesce(full_name, email) into v_new_name
      from public.profiles where id = new.assigned_to;

    new.assigned_at := case when new.assigned_to is null then null else now() end;

    insert into public.submission_events
      (tenant_id, submission_id, actor, actor_id, action, detail)
    values (
      new.tenant_id, new.id, v_actor, v_actor_id,
      case when new.assigned_to is null then 'unassigned' else 'assigned' end,
      case
        when new.assigned_to is null
          then format('Unassigned from %s', coalesce(v_old_name, 'a teammate'))
        else format('Assigned to %s', coalesce(v_new_name, 'a teammate'))
      end
    );
  end if;

  return new;
end;
$$;

-- BEFORE UPDATE, not AFTER: the function assigns to new.closed_at and
-- new.assigned_at, which only takes effect in a BEFORE trigger.
--
-- On the trigger name: Postgres fires BEFORE row triggers in alphabetical
-- order, so 'submissions_log_changes_trg' runs before
-- 'submissions_touch_updated_at' from 0001. Both write to NEW and neither
-- touches the other's columns, so the order is not load-bearing today. Worth
-- knowing before renaming either one.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'submissions_log_changes_trg'
       and tgrelid = 'public.submissions'::regclass
  ) then
    create trigger submissions_log_changes_trg
      before update on public.submissions
      for each row execute function public.submissions_log_changes();
  end if;
end $$;

comment on column public.submission_events.actor_id is
  'Profile that caused the event. Null for the client and for service-role writes, where actor carries the label instead.';


-- ===========================================================================
-- 7. Tenant events: the team and settings half of the activity log
--
-- submission_events is submission-scoped, so "Alex made Dana an admin" has
-- nowhere to live there, and a role change is exactly the kind of thing an
-- audit trail exists for. Append-only, like every other history here.
-- ===========================================================================

create table if not exists public.tenant_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor       text not null,
  -- e.g. 'invited', 'role_changed', 'removed', 'reactivated',
  -- 'stage_added', 'stage_renamed', 'stage_reordered', 'stage_retired'
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists tenant_events_tenant_created_idx
  on public.tenant_events (tenant_id, created_at desc);


-- ===========================================================================
-- 8. Team management RPCs
--
-- These exist because the rules that matter are multi-row, and RLS is
-- row-granular. The decisive one: an admin must not be able to demote or
-- remove the LAST remaining admin. A policy cannot count peers. Without this
-- check, the first admin who demotes themselves locks the tenant out of its
-- own team screen permanently, with no in-app recovery.
--
-- Unlike the throttle RPCs in 0003/0004, these are granted to authenticated
-- on purpose: they are the sanctioned privileged path, and each one re-derives
-- the caller from auth.uid() rather than trusting a parameter. The 0004
-- precedent makes "revoke from public" look like the reflex; here it would
-- break team management outright.
-- ===========================================================================

-- Change a teammate's role. Admin only, same tenant only, never the caller.
create or replace function public.set_teammate_role(
  p_profile_id uuid,
  p_role       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles.' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;

  -- Changing your own role is refused outright rather than counted. Promoting
  -- yourself is impossible anyway (you are already an admin to be here), and
  -- demoting yourself is the lockout this function exists to prevent.
  if p_profile_id = v_uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_profile_id
       and tenant_id = v_tenant
       and deactivated_at is null
  ) then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  update public.profiles
     set role = p_role
   where id = p_profile_id
     and tenant_id = v_tenant;
end;
$$;

-- Deactivate a teammate. Soft, for the reasons in section 1: their name has
-- to keep resolving in every note and event they ever wrote.
--
-- Leads assigned to them are released here, inside the same statement, so a
-- removal can never leave a lead owned by someone with no access. Passing
-- p_reassign_to moves them to a named teammate instead of unassigning.
create or replace function public.remove_teammate(
  p_profile_id   uuid,
  p_reassign_to  uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_tenant  uuid := public.current_tenant_id();
  v_admins  integer;
  v_moved   integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove teammates.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_profile_id
       and tenant_id = v_tenant
       and deactivated_at is null
  ) then
    raise exception 'That teammate is not on your team.' using errcode = 'P0002';
  end if;

  -- The last-admin guard. Counted, not assumed, and it covers removing
  -- yourself as well as removing the only other admin.
  select count(*) into v_admins
    from public.profiles
   where tenant_id = v_tenant
     and role = 'admin'
     and deactivated_at is null;

  if v_admins <= 1 and exists (
    select 1 from public.profiles
     where id = p_profile_id and role = 'admin'
  ) then
    raise exception 'That is the only admin on the team. Promote someone else first.'
      using errcode = '42501';
  end if;

  if p_reassign_to is not null and not exists (
    select 1 from public.profiles
     where id = p_reassign_to
       and tenant_id = v_tenant
       and deactivated_at is null
       and id <> p_profile_id
  ) then
    raise exception 'Cannot reassign to that teammate.' using errcode = 'P0002';
  end if;

  -- Release their leads first, so the update trigger in section 6 logs each
  -- move while the profile is still active and its name still resolves.
  update public.submissions
     set assigned_to = p_reassign_to
   where tenant_id = v_tenant
     and assigned_to = p_profile_id;
  get diagnostics v_moved = row_count;

  update public.profiles
     set deactivated_at = now(),
         deactivated_by = v_uid
   where id = p_profile_id;

  return v_moved;
end;
$$;

grant  execute on function public.set_teammate_role(uuid, text)  to authenticated;
grant  execute on function public.remove_teammate(uuid, uuid)    to authenticated;
revoke execute on function public.set_teammate_role(uuid, text)  from public, anon;
revoke execute on function public.remove_teammate(uuid, uuid)    from public, anon;


-- ===========================================================================
-- 9. handle_new_user: trust invite metadata, never self-signup metadata
--
-- This is the sharpest risk in the migration. Signup is enabled on this
-- project, so anyone can POST /auth/v1/signup with
--     {"data": {"role": "admin", "tenant_id": "..."}}
-- and that lands verbatim in raw_user_meta_data. A trigger that reads role
-- from there is a one-request compromise of every tenant.
--
-- So the trigger does not ask "is there a role in the metadata", it asks
-- "did an administrator create this user". The distinguishing signal is
-- invited_at: GoTrue sets it on the invite path and leaves it null on
-- self-signup, and an API caller cannot set it themselves.
--
-- RECOMMENDED ALONGSIDE THIS MIGRATION: turn self-signup off entirely, in the
-- Supabase dashboard and in supabase/config.toml ([auth] enable_signup and
-- [auth.email] enable_signup). There is no register page and no self-serve
-- product here; signup is pure attack surface. A migration cannot edit
-- config.toml, hence this note. The invited_at gate below holds either way.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited  boolean := new.invited_at is not null;
  v_tenant   uuid    := '00000000-0000-4000-8000-000000000001';
  v_role     text    := 'member';
  v_claimed  text;
begin
  if v_invited then
    -- Role, whitelisted. A junk or hostile value degrades to 'member' rather
    -- than raising: a failing trigger aborts the auth user creation, which
    -- would turn a typo in an invite into a baffling signup failure.
    v_claimed := new.raw_user_meta_data ->> 'role';
    v_role := case when v_claimed in ('admin', 'member') then v_claimed else 'member' end;

    -- Tenant, only if it actually exists. Phase 3 invites will carry a
    -- partner tenant here; an unknown id falls back to the default rather
    -- than creating an orphan profile pointing at nothing.
    v_claimed := new.raw_user_meta_data ->> 'tenant_id';
    if v_claimed is not null and exists (
      select 1 from public.tenants where id = v_claimed::uuid
    ) then
      v_tenant := v_claimed::uuid;
    end if;
  end if;

  insert into public.profiles (id, tenant_id, full_name, role, email)
  values (
    new.id,
    v_tenant,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    new.email
  )
  on conflict (id) do nothing;

  return new;
exception
  when invalid_text_representation then
    -- A malformed tenant_id uuid in the metadata. Fall back to a safe profile
    -- rather than blocking account creation.
    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (
      new.id,
      '00000000-0000-4000-8000-000000000001',
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      'member',
      new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Backfill the email snapshot for accounts that predate the column, so the
-- team screen and the event backfill above have addresses to work with.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;


-- ===========================================================================
-- 10. Row-level security for the new tables
--
-- Same stance as 0001: anon gets no policies anywhere, authenticated staff
-- are scoped to their own tenant at the data layer, and history is
-- append-only. Writes that need a role check go through the RPCs in section 8
-- rather than through a policy, because RLS cannot express them.
-- ===========================================================================

alter table public.lead_stages       enable row level security;
alter table public.submission_notes  enable row level security;
alter table public.tenant_events     enable row level security;

-- Lead stages: everyone on the tenant reads them (the console renders stage
-- labels on every row), only admins write them.
do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_stages'
      and policyname = 'members read their tenant''s stages') then
    create policy "members read their tenant's stages"
      on public.lead_stages for select
      to authenticated
      using (tenant_id = public.current_tenant_id());
  end if;

  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_stages'
      and policyname = 'admins add stages in their tenant') then
    create policy "admins add stages in their tenant"
      on public.lead_stages for insert
      to authenticated
      with check (tenant_id = public.current_tenant_id() and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_stages'
      and policyname = 'admins edit stages in their tenant') then
    create policy "admins edit stages in their tenant"
      on public.lead_stages for update
      to authenticated
      using (tenant_id = public.current_tenant_id() and public.is_admin())
      with check (tenant_id = public.current_tenant_id() and public.is_admin());
  end if;

  -- No delete policy. Stages are retired, never deleted: see section 3.

  -- Notes: read within the tenant, append within the tenant, and the author
  -- must be the caller. Without that with-check clause a member could write a
  -- note attributed to someone else, which would make the history worse than
  -- having none.
  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'submission_notes'
      and policyname = 'members read their tenant''s notes') then
    create policy "members read their tenant's notes"
      on public.submission_notes for select
      to authenticated
      using (tenant_id = public.current_tenant_id());
  end if;

  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'submission_notes'
      and policyname = 'members write notes in their tenant') then
    create policy "members write notes in their tenant"
      on public.submission_notes for insert
      to authenticated
      with check (
        tenant_id = public.current_tenant_id()
        and author_id = auth.uid()
      );
  end if;

  -- No update and no delete policy on notes. Deliberate: see section 5.

  -- Tenant events: the whole team can read the audit trail, admins append.
  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_events'
      and policyname = 'members read their tenant''s team events') then
    create policy "members read their tenant's team events"
      on public.tenant_events for select
      to authenticated
      using (tenant_id = public.current_tenant_id());
  end if;

  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenant_events'
      and policyname = 'admins write team events in their tenant') then
    create policy "admins write team events in their tenant"
      on public.tenant_events for insert
      to authenticated
      with check (
        tenant_id = public.current_tenant_id()
        and public.is_admin()
        and actor_id = auth.uid()
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tighten the existing events insert policy so a member cannot forge
-- another user's authorship now that actor_id exists.
--
-- Null actor_id stays allowed: that is the 'client' and 'system' case, which
-- only ever comes from the service-role client (bypassing RLS) or the trigger
-- in section 6, but leaving it permitted keeps the policy honest about what
-- the column means rather than making it accidentally NOT NULL.
-- ---------------------------------------------------------------------------
drop policy if exists "members write events in their tenant" on public.submission_events;
create policy "members write events in their tenant"
  on public.submission_events for insert
  to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (actor_id is null or actor_id = auth.uid())
  );
