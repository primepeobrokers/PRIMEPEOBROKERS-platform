import "server-only";

import { createClient } from "@/lib/supabase/server";
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
