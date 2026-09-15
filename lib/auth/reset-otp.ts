import "server-only";

import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendPasswordResetCode } from "@/lib/email";
import { getTenant } from "@/lib/tenant/resolve";
import { brandFor } from "@/lib/tenant/email-brand";

/**
 * Password reset by one-time code.
 *
 * GoTrue still owns identity. admin.generateLink() mints the code without
 * sending anything, and /auth/v1/verify validates it and issues a real
 * session, so auth.uid() and every RLS policy keep working. All this module
 * changes is who delivers the email: Resend, on the brand's own domain,
 * instead of Supabase's built-in mailer and its 2-per-hour cap.
 *
 * The code is never stored here. GoTrue holds it, along with its single-use
 * and expiry semantics, which means there is no credential at rest and no
 * comparison for us to get wrong.
 */

/** Our own code lifetime. Deliberately tighter than GoTrue's otp_expiry. */
export const RESET_CODE_TTL_MINUTES = 15;

/**
 * This project's GoTrue is configured for 8-digit codes. Read it from the
 * generated code rather than assuming, but validate input against this so a
 * malformed guess never reaches the auth server.
 */
export const RESET_CODE_LENGTH = 8;

/**
 * HMAC of an identifier under a server-side pepper.
 *
 * Keys the throttle tables without storing the identifier itself, so a dump of
 * password_reset_attempts is not a list of staff email addresses. The pepper
 * lives only in the environment and never reaches the database.
 */
export function hashIdentifier(value: string): string {
  const pepper = process.env.RESET_PEPPER;
  if (!pepper) {
    // Fail closed. A missing pepper would otherwise silently collapse every
    // identity onto one hash and throttle all users together.
    throw new Error("RESET_PEPPER is not set: password reset is unavailable.");
  }
  return createHmac("sha256", pepper).update(value).digest("hex");
}

/** One place, so capitalisation cannot be used to slip past the throttle. */
export function normaliseEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Postgres bytea literals arrive over PostgREST as \x-prefixed hex. */
function bytea(hex: string): string {
  return `\\x${hex}`;
}

type IssueResult =
  | { ok: true }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/**
 * Generates a code and mails it.
 *
 * Always resolves as success to the caller for an unknown address: the reset
 * form must not reveal which emails have accounts.
 */
export async function issueResetCode(
  email: string,
  ip: string | null,
): Promise<IssueResult> {
  const normalised = normaliseEmail(email);
  const emailHash = bytea(hashIdentifier(`email:${normalised}`));
  const ipHash = ip ? bytea(hashIdentifier(`ip:${ip}`)) : null;

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin.rpc("claim_reset_send", {
    p_email_hash: emailHash,
    p_ip_hash: ipHash,
  });
  if (claimError) {
    console.error("[reset] throttle check failed", claimError.message);
    // Fail closed: better to ask the user to retry than to hand out an
    // unmetered send path because the limiter is unavailable.
    return { ok: false, reason: "throttled", retryAfterSeconds: 60 };
  }

  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.allowed) {
    return {
      ok: false,
      reason: "throttled",
      retryAfterSeconds: row?.retry_after_seconds ?? 60,
    };
  }

  // generateLink mints the code and returns it. It does NOT send an email,
  // which is the whole reason this flow can bypass Supabase's mailer.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalised,
  });

  if (error || !data?.properties?.email_otp) {
    // Almost always "user not found". Swallow it: reporting the difference
    // would turn this endpoint into an account-existence oracle.
    console.warn("[reset] no code generated for a requested address");
    return { ok: true };
  }

  // Branded for the host the request came from: a partner's user resetting
  // on their portal hears from the partner, not from the house.
  const sent = await sendPasswordResetCode({
    to: normalised,
    code: data.properties.email_otp,
    expiresInMinutes: RESET_CODE_TTL_MINUTES,
    brand: brandFor(await getTenant()),
  });

  if (!sent.ok) {
    // Delivery failed on our side, so give the attempt back rather than
    // charging the user for our fault.
    await admin.rpc("release_reset_send", { p_email_hash: emailHash });
    console.error("[reset] delivery failed; send credit released");
  }

  return { ok: true };
}

/**
 * Verifies a code and, on success, establishes the session.
 *
 * Two clients are in play and swapping them breaks this silently:
 *   - the ADMIN client counts the attempt (service role, no cookies)
 *   - the COOKIE-BOUND client calls verifyOtp, because only that one writes
 *     the sb-* session cookies into the request
 */
export async function consumeResetCode(
  email: string,
  code: string,
): Promise<{ ok: boolean }> {
  const normalised = normaliseEmail(email);
  const emailHash = bytea(hashIdentifier(`email:${normalised}`));

  const admin = createAdminClient();

  // Count the guess BEFORE asking GoTrue. Our envelope expires sooner than
  // GoTrue's token does, so checking in the other order would let a code
  // older than our own TTL through.
  const { data: claim, error: claimError } = await admin.rpc(
    "claim_reset_verify",
    { p_email_hash: emailHash },
  );
  if (claimError) {
    console.error("[reset] verify throttle failed", claimError.message);
    return { ok: false };
  }

  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.allowed) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "recovery",
    email: normalised,
    token: code,
  });
  if (error) return { ok: false };

  // Session established. The envelope has done its job.
  await admin.rpc("clear_reset_state", { p_email_hash: emailHash });
  return { ok: true };
}
