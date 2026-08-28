"use server";

import { createClient } from "@/lib/supabase/server";

/** Appends a "record opened" event, attributed to the signed-in user. */
export async function logRecordOpen(submissionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS scopes this select to the user's tenant: no row, no log.
  const { data: lead } = await supabase
    .from("submissions")
    .select("tenant_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!lead) return;

  await supabase.from("submission_events").insert({
    tenant_id: lead.tenant_id,
    submission_id: submissionId,
    actor: user.email ?? "staff",
    action: "opened",
    detail: "Record opened",
  });
}
