-- ===========================================================================
-- 0012 · Fix route_submission: the composite FKs are checked immediately
--
-- THE BUG
--
-- 0011's route_submission moved the submission first, then its notes and
-- events, on the stated reasoning that "the children are not re-validated
-- until they are themselves updated". That reasoning is wrong, and the
-- integration suite caught it on the first run against a lead that had a note:
--
--   update or delete on table "submissions" violates foreign key constraint
--   "submission_notes_tenant_submission_fkey" on table "submission_notes"
--
-- 0006's FKs reference submissions (tenant_id, id), so moving the PARENT's
-- tenant_id orphans every child row at that instant. Postgres validates a
-- referenced-side update immediately unless the constraint is DEFERRABLE, and
-- 0006 declared these without that clause. There is no ordering that works:
-- children cannot move first (their target parent row does not exist in the
-- new tenant yet) and the parent cannot move first (it orphans them).
--
-- Worse, routing a lead with NO notes and NO events succeeded, so the bug was
-- invisible on a fresh lead and appeared only once a lead had history. That is
-- exactly the shape of bug that reaches production.
--
-- THE FIX
--
-- Make both constraints DEFERRABLE INITIALLY IMMEDIATE, then have
-- route_submission SET CONSTRAINTS ... DEFERRED for its own transaction. All
-- three updates land, and the check runs once at commit, when parent and
-- children agree again.
--
-- INITIALLY IMMEDIATE, not INITIALLY DEFERRED: every other write in the app
-- keeps failing fast at the statement that caused it, which is what makes the
-- cross-tenant stitching test in the integration suite meaningful. Only this
-- one function opts into deferral, for the duration of one transaction.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Make the two composite FKs deferrable
--
-- A constraint's deferrability cannot be altered in place: it has to be
-- dropped and re-added. Both are re-added with identical columns, references
-- and ON DELETE behaviour, so the only change is the DEFERRABLE clause.
-- ---------------------------------------------------------------------------

alter table public.submission_notes
  drop constraint if exists submission_notes_tenant_submission_fkey;

alter table public.submission_notes
  add constraint submission_notes_tenant_submission_fkey
  foreign key (tenant_id, submission_id)
  references public.submissions (tenant_id, id)
  on delete cascade
  deferrable initially immediate;

alter table public.submission_events
  drop constraint if exists submission_events_tenant_submission_fkey;

alter table public.submission_events
  add constraint submission_events_tenant_submission_fkey
  foreign key (tenant_id, submission_id)
  references public.submissions (tenant_id, id)
  on delete cascade
  deferrable initially immediate;

comment on constraint submission_notes_tenant_submission_fkey on public.submission_notes is
  'Composite so a note cannot claim one tenant while pointing at another '
  'tenant''s lead (0006). DEFERRABLE so route_submission can move a lead and '
  'its history in one transaction; still INITIALLY IMMEDIATE, so every other '
  'write fails at the offending statement. See 0012.';


-- ---------------------------------------------------------------------------
-- 2. route_submission, with the deferral
--
-- Identical to 0011 apart from the SET CONSTRAINTS line and the comment above
-- the updates. Restated in full rather than patched, because a reader needs to
-- see the whole guarded operation in one place.
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
    THE 0012 FIX. 0006's FKs reference submissions (tenant_id, id), so moving
    the parent's tenant_id orphans every note and event at that instant, and
    Postgres checks a referenced-side update immediately. There is no ordering
    that satisfies it: children cannot move first (no parent row in the new
    tenant yet), and the parent cannot move first (it orphans them).

    Deferring to commit lets all three updates land, and the check then sees a
    consistent parent and children. Scoped to this transaction only, so every
    other write in the app still fails fast.
  */
  set constraints
    submission_notes_tenant_submission_fkey,
    submission_events_tenant_submission_fkey
    deferred;

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
  'could not own it there. Defers the composite FKs for its own transaction, '
  'because moving the parent orphans the children until they follow. The ONLY '
  'path that changes submissions.tenant_id. See 0011 and 0012.';


-- ---------------------------------------------------------------------------
-- 3. Assert the end state
-- ---------------------------------------------------------------------------

do $assert_0012$
declare
  v_bad text;
begin
  -- Both constraints must be deferrable, or route_submission fails on any
  -- lead that has a note or an event: invisible on a fresh lead, which is how
  -- this shipped in 0011.
  select string_agg(conname, ', ') into v_bad
    from pg_constraint
   where conname in (
     'submission_notes_tenant_submission_fkey',
     'submission_events_tenant_submission_fkey'
   )
     and not condeferrable;

  if v_bad is not null then
    raise exception
      'These composite FKs are not deferrable: %. route_submission cannot move a lead that has history.',
      v_bad;
  end if;

  -- But they must NOT default to deferred: every other write should still
  -- fail at the statement that caused it.
  select string_agg(conname, ', ') into v_bad
    from pg_constraint
   where conname in (
     'submission_notes_tenant_submission_fkey',
     'submission_events_tenant_submission_fkey'
   )
     and condeferred;

  if v_bad is not null then
    raise exception
      'These FKs default to DEFERRED: %. Use INITIALLY IMMEDIATE so ordinary writes still fail fast.',
      v_bad;
  end if;

  -- The constraints must still be COMPOSITE. Dropping and re-adding is where
  -- a two-column FK could quietly become one column, which would reopen the
  -- cross-tenant stitching hole 0006 closed.
  if exists (
    select 1 from pg_constraint
     where conname = 'submission_notes_tenant_submission_fkey'
       and array_length(conkey, 1) <> 2
  ) then
    raise exception
      'submission_notes_tenant_submission_fkey is no longer composite: a note could claim one tenant while pointing at another tenant''s lead.';
  end if;
end $assert_0012$;
