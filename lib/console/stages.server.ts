import "server-only";

import { createClient } from "@/lib/supabase/server";
import { MEMBER_SELECT, type Member } from "./columns";
import { STAGE_SELECT, toStage, type Stage, type StageRow } from "./stages";

/**
 * The database read for lead stages, kept apart from the helpers in
 * stages.ts.
 *
 * The split is not cosmetic: StageBadge renders inside client components
 * (lead-row.tsx, lead-card.tsx), so everything reachable from those has to be
 * bundleable for the browser. lib/supabase/server.ts imports next/headers,
 * which fails the build the moment it is pulled into a client graph. Keeping
 * the reader here means the pure helpers stay importable from either side.
 */

/**
 * The caller's tenant stages, ordered as the pipeline reads.
 *
 * Includes retired stages: a lead may still be sitting on one and its label
 * has to keep rendering. Callers that offer a choice filter on `retired`
 * themselves; callers that display a value should not.
 *
 * Returns [] rather than throwing. A stage list that fails to load should
 * degrade the console to slug-labelled badges, not blank the leads page, and
 * the read is already tenant-scoped by RLS.
 */
export async function fetchStages(): Promise<Stage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_stages")
    .select(STAGE_SELECT)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as StageRow[]).map(toStage);
}

/**
 * The tenant roster, for the assignee picker and filter.
 *
 * Deactivated teammates are included: a lead may still be assigned to someone
 * who has since been removed, and the UI has to be able to name them rather
 * than showing a blank owner. Callers offering a choice filter them out.
 *
 * One flat query rather than a relational select on submissions. Embedding
 * profiles in the leads query would nest the row shape, force a nullable
 * nested type into SubmissionRow, and depend on FK introspection working
 * through RLS on profiles. The roster is a handful of rows; fetching it once
 * per page and resolving names from a Map is both simpler and cheaper.
 *
 * Returns [] on error, for the same reason fetchStages does: a missing roster
 * should degrade the owner column, not blank the leads page.
 */
export async function fetchMembers(): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(MEMBER_SELECT)
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data as unknown as Member[];
}
