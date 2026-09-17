import "server-only";

import { cache } from "react";

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
  const tenantId = await homeTenantId();
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from("lead_stages")
    .select(STAGE_SELECT)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as StageRow[]).map(toStage);
}

/**
 * The caller's HOME tenant, from current_tenant_id().
 *
 * Until migration 0009 these two readers relied on RLS to scope them: a user
 * could only see their own tenant's rows, so "select everything" meant "my
 * tenant". 0009 widened reads for platform staff to every tenant, and the
 * stage filter started listing "New" once per partner (five tenants, five
 * "New"s), with the owner filter showing every partner's staff. Stages and the
 * roster are things you administer, so they are always the home tenant's;
 * cross-tenant reading is for leads. The explicit filter restores that.
 *
 * Filtering by slug still works across tenants, because every tenant is
 * seeded with the same four slugs and submissions store the slug, not the id.
 */
/*
  cache()d per request: fetchStages and fetchMembers are called together on
  every console page, and without this each one paid its own RPC for the same
  value. Per-request scope is the right one, since the caller's tenant cannot
  change mid-render.
*/
const homeTenantId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error || typeof data !== "string") return null;
  return data;
});

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
  const tenantId = await homeTenantId();
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(MEMBER_SELECT)
    .eq("tenant_id", tenantId)
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data as unknown as Member[];
}
