import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ResolvedTenant } from "./resolve";

/**
 * The sales reps to email about a new lead on this tenant: active reps
 * assigned to the partner (migration 0018). Always [] for the house, whose
 * leads no rep sees.
 *
 * Service role, because the caller is an anonymous visitor submitting the
 * form and has no session to read through. The tenant comes from the host,
 * never from the request body, so this cannot be pointed at another partner.
 *
 * Two flat reads rather than an embed: rep_partners has two FKs to profiles
 * (rep_id and assigned_by), which makes a PostgREST embed ambiguous.
 *
 * Never throws. A rep email is a courtesy on top of the house copy, so a
 * failed read logs and sends nothing rather than risking the submit.
 */
export async function repInboxFor(tenant: ResolvedTenant | null): Promise<string[]> {
  if (!tenant || tenant.isHouse) return [];
  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("rep_partners")
      .select("rep_id")
      .eq("tenant_id", tenant.id);
    if (error) throw error;
    const ids = (rows ?? []).map((r: { rep_id: string }) => r.rep_id);
    if (ids.length === 0) return [];

    const { data: reps, error: pe } = await admin
      .from("profiles")
      .select("email")
      .in("id", ids)
      .eq("role", "rep")
      .is("deactivated_at", null);
    if (pe) throw pe;
    return (reps ?? [])
      .map((r: { email: string | null }) => r.email?.trim().toLowerCase() ?? "")
      .filter((e) => e.includes("@"));
  } catch (e) {
    console.error(`[email] could not look up reps for "${tenant.slug}"`, e);
    return [];
  }
}
