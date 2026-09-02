"use server";

import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
