import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashIdentifier } from "@/lib/auth/reset-otp";

/**
 * Rate limiting for the unauthenticated discovery actions.
 *
 * saveDraft and requestResumeLink are Server Actions, which means they are
 * public HTTP endpoints callable without any UI. Before this, saveDraft would
 * insert a submissions row on every call with the service-role key, and
 * requestResumeLink would email any address the caller supplied. Neither had a
 * limit, so both were unmetered.
 *
 * Counters live in Postgres rather than memory: on serverless, a module-level
 * Map is per-instance and amounts to no limit at all.
 */

/** Best-effort client IP. Absent header means the limit simply does not bind. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  // Only the right-most hop was appended by our own infrastructure; entries to
  // the left are caller-supplied and trivially spoofed.
  return h.get("x-real-ip") ?? (forwarded ? forwarded.split(",").pop()!.trim() : null);
}

export async function claimRequest(
  scope: string,
  key: string | null,
  max: number,
  windowInterval: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // Nothing to key on (no proxy headers, e.g. local dev): allow rather than
  // lock everyone out of the flow.
  if (!key) return { allowed: true, retryAfterSeconds: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_request", {
    p_scope: scope,
    p_key_hash: `\\x${hashIdentifier(`${scope}:${key}`)}`,
    p_max: max,
    p_window: windowInterval,
  });

  if (error) {
    console.error("[throttle] check failed", error.message);
    // Fail open for the discovery flow: a limiter outage must not stop real
    // visitors from completing a lead. The reset path fails closed instead,
    // because there the downside is spam rather than a lost customer.
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    retryAfterSeconds: row?.retry_after_seconds ?? 0,
  };
}
