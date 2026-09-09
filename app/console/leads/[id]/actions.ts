"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { memberName } from "@/lib/console/columns";
import { NOTE_MAX, type NoteView } from "@/lib/console/notes";

/**
 * Mutations on a single lead.
 *
 * Every one follows the same order, and the order is the point:
 *
 *   1. guardAction, so an expired session or a member reaching an admin
 *      action gets a message rather than a redirect thrown mid-transition.
 *   2. Validate the input by hand against live data, never against a list the
 *      client supplied.
 *   3. Re-read the target row through RLS. That read is the tenant check: no
 *      row means the id belongs to someone else, or does not exist, and the
 *      two are deliberately indistinguishable in the response.
 *   4. Write.
 *   5. revalidatePath before returning, so the list the person navigates back
 *      to is not serving a cached payload of the value they just changed.
 *
 * The activity log is NOT written here. A trigger in migration 0005 owns
 * lead_stage and assigned_to changes, because there are three write paths
 * into submissions and app-side logging would drift across them.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionResult = { error: string } | { ok: true };

/*
  The dynamic segment has to be the literal bracket form, and the "page" kind
  is required for it. Interpolating the real id would invalidate only the lead
  being edited; every open detail view should see the change. Getting this
  wrong is a silent no-op rather than an error, which is why it lives in one
  helper rather than being retyped at each call site.
*/
function revalidateLead(): void {
  revalidatePath("/console/leads/[id]", "page");
  revalidatePath("/console");
}

/** Sets the pipeline stage. Any signed-in teammate may move a lead. */
export async function setStage(input: {
  submissionId: string;
  stage: string;
}): Promise<ActionResult> {
  const guard = await guardAction();
  if (!guard.ok) return { error: guard.error };

  const submissionId = String(input.submissionId ?? "");
  const stage = String(input.stage ?? "").trim();
  if (!UUID_RE.test(submissionId)) return { error: "That record is not valid." };
  if (!stage) return { error: "Pick a stage." };

  const supabase = await createClient();

  // Validate against the tenant's live stages, not against anything the
  // client sent. A retired stage is refused: it may still hold old leads, but
  // nothing new should move onto it.
  const { data: target } = await supabase
    .from("lead_stages")
    .select("slug, label, retired_at")
    .eq("slug", stage)
    .maybeSingle();
  if (!target) return { error: "That stage no longer exists." };
  if (target.retired_at) {
    return { error: `${target.label} has been retired. Pick another stage.` };
  }

  const { data: lead } = await supabase
    .from("submissions")
    .select("id, lead_stage")
    .eq("id", submissionId)
    .maybeSingle();
  if (!lead) return { error: "That record is no longer available." };

  // Nothing changed: skip the write so the activity log does not fill with
  // entries for clicking the stage a lead is already on.
  if (lead.lead_stage === stage) return { ok: true };

  const { error } = await supabase
    .from("submissions")
    .update({ lead_stage: stage })
    .eq("id", submissionId);
  if (error) {
    console.error("[console] setStage failed", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidateLead();
  return { ok: true };
}

/** Assigns or clears the owner. Passing null unassigns. */
export async function setAssignee(input: {
  submissionId: string;
  assigneeId: string | null;
}): Promise<ActionResult> {
  const guard = await guardAction();
  if (!guard.ok) return { error: guard.error };

  const submissionId = String(input.submissionId ?? "");
  const assigneeId = input.assigneeId ? String(input.assigneeId) : null;
  if (!UUID_RE.test(submissionId)) return { error: "That record is not valid." };
  if (assigneeId !== null && !UUID_RE.test(assigneeId)) {
    return { error: "That teammate is not valid." };
  }

  const supabase = await createClient();

  /*
    Confirm the assignee is a live teammate.

    This check used to rely on RLS scoping profiles to the caller's own
    tenant, so that a cross-tenant id "simply returned no row". Migration 0009
    widened the profiles SELECT policy to tenant_scope(), so for platform
    staff this lookup now returns partner profiles too and that reasoning no
    longer holds. The real boundary is the submissions_guard_assignee trigger
    (0009 section 6), which rejects any assignee who is neither in the lead's
    tenant nor platform staff. This lookup is now only about giving a usable
    error before the write rather than surfacing a 42501.
  */
  if (assigneeId) {
    const { data: person } = await supabase
      .from("profiles")
      .select("id, deactivated_at")
      .eq("id", assigneeId)
      .maybeSingle();
    if (!person) return { error: "That teammate is not on your team." };
    if (person.deactivated_at) {
      return { error: "That teammate has been removed from the team." };
    }
  }

  const { data: lead } = await supabase
    .from("submissions")
    .select("id, assigned_to")
    .eq("id", submissionId)
    .maybeSingle();
  if (!lead) return { error: "That record is no longer available." };

  if (lead.assigned_to === assigneeId) return { ok: true };

  const { error } = await supabase
    .from("submissions")
    .update({ assigned_to: assigneeId })
    .eq("id", submissionId);
  if (error) {
    /*
      submissions_guard_assignee (0009) raises a written-for-humans message
      when the assignee could not legitimately own this lead. Pass it through
      rather than flattening it to "try again", which would be advice that
      cannot work. Same pattern as rpcMessage in the team actions.
    */
    if (error.message?.includes("cannot own this lead")) {
      return { error: "That teammate cannot own this lead." };
    }
    console.error("[console] setAssignee failed", error);
    return { error: "Could not update the owner. Try again." };
  }

  revalidateLead();
  return { ok: true };
}

/**
 * Appends an internal note.
 *
 * Returns the created note so the client can render it immediately rather
 * than waiting for the revalidation round trip: notes are the one place in
 * the console where typing latency is felt.
 */
export async function addNote(input: {
  submissionId: string;
  body: string;
}): Promise<{ error: string } | { ok: true; note: NoteView }> {
  const guard = await guardAction();
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const submissionId = String(input.submissionId ?? "");
  const body = String(input.body ?? "").trim();
  if (!UUID_RE.test(submissionId)) return { error: "That record is not valid." };
  if (!body) return { error: "Write something first." };
  if (body.length > NOTE_MAX) {
    return {
      error: `That note is ${body.length.toLocaleString("en-US")} characters. Keep it to ${NOTE_MAX.toLocaleString("en-US")}.`,
    };
  }

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("submissions")
    .select("id, tenant_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!lead) return { error: "That record is no longer available." };

  /*
    author_name is a snapshot, not a join. It is a historical fact: if this
    person is later removed from the team, author_id goes null but the note
    still says who wrote it. See migration 0005 section 5.
  */
  const { data, error } = await supabase
    .from("submission_notes")
    .insert({
      tenant_id: lead.tenant_id,
      submission_id: submissionId,
      author_id: ctx.userId,
      author_name: memberName({
        id: ctx.userId,
        full_name: ctx.fullName,
        email: ctx.email,
        role: ctx.role,
        deactivated_at: null,
      }),
      body,
    })
    .select("id, body, author_name, created_at")
    .single();

  if (error || !data) {
    console.error("[console] addNote failed", error);
    return { error: "Could not save the note. Try again." };
  }

  revalidatePath("/console/leads/[id]", "page");
  return { ok: true, note: data as NoteView };
}

/**
 * Appends a "record opened" event, attributed to the signed-in user.
 *
 * Fired from a mount effect, so it is deliberately quiet: every failure path
 * returns rather than throwing, because a missing audit line must not break
 * the page the person is trying to read. It also does not revalidate anything,
 * which would re-render the page that just triggered it.
 */
export async function logRecordOpen(submissionId: string): Promise<void> {
  const guard = await guardAction();
  if (!guard.ok) return;
  const { ctx } = guard;

  // Validated like every other action here. A malformed id would otherwise
  // reach PostgREST and come back as a 400 that maybeSingle() flattens to
  // null, so the failure was invisible rather than merely harmless.
  if (!UUID_RE.test(submissionId)) return;

  const supabase = await createClient();

  /*
    Re-read the row through RLS before writing. ctx.tenantId is already known,
    but that is the caller's tenant, not the record's: without this read a
    member could log an event against another tenant's submission id. No row,
    no log.
  */
  const { data: lead } = await supabase
    .from("submissions")
    .select("tenant_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!lead) return;

  /*
    Collapse repeat opens. The detail page logs on every mount, so without
    this a single afternoon of triage buries the stage changes and notes that
    the activity log exists to record. One hour is long enough to keep the log
    readable and short enough that returning to a record the next day still
    registers as a fresh look.
  */
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("submission_events")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("actor_id", ctx.userId)
    .eq("action", "opened")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return;

  await supabase.from("submission_events").insert({
    tenant_id: lead.tenant_id,
    submission_id: submissionId,
    actor: ctx.email || "staff",
    actor_id: ctx.userId,
    action: "opened",
    detail: "Record opened",
  });
}
