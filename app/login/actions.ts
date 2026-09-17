"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifyHost } from "@/lib/tenant/host";
import { getSessionContext } from "@/lib/auth/session";
import {
  RESET_CODE_LENGTH,
  RESET_CODE_TTL_MINUTES,
  consumeResetCode,
  issueResetCode,
} from "@/lib/auth/reset-otp";

export async function signIn(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<{ error: string } | never> {
  const email = String(input.email ?? "").trim();
  const password = String(input.password ?? "");
  if (!email || !password) {
    return {
      error:
        "Enter your email and password. If you have not set one yet, use the invite link.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        "That email and password combination does not match an account. Check both, or use the reset link.",
    };
  }

  /*
    Where to land. Still an allowlist of path PREFIXES, never "any path the
    caller sent": `next` arrives from a query string, so accepting it wholesale
    would be an open redirect (`//evil.example` is a protocol-relative URL that
    browsers treat as absolute).

    A partner has no console, so on a partner host the destination is their own
    portal instead. classifyHost reads the Host header, which the client cannot
    use to reach a route it is not already on.
  */
  const host = classifyHost((await headers()).get("host"));
  const home = host.kind === "partner" ? "/portal" : "/console";
  const allowed = host.kind === "partner"
    ? ["/portal"]
    : ["/console"];

  const next =
    input.next && allowed.some((p) => input.next!.startsWith(p))
      ? input.next
      : home;
  /*
    Both sign-in and sign-out end in a redirect, so a toast fired before it
    would be torn down with the page. The destination is flagged instead and
    the landing page raises the toast once, then strips the parameter so a
    refresh or a shared URL does not repeat it.
  */
  redirect(`${next}${next.includes("?") ? "&" : "?"}welcome=1`);
}

/**
 * Emails a one-time code.
 *
 * Delivery is Resend on the brand domain, not Supabase's mailer: no per-hour
 * cap, no redirect-URL configuration, and no link that can land on the wrong
 * origin. Identity is still GoTrue's, so nothing downstream changes.
 */
export async function sendResetCode(input: {
  email: string;
}): Promise<{ error: string } | { ok: true; ttlMinutes: number }> {
  const email = String(input.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { error: "That address is missing an @ or a domain." };
  }

  // Best-effort client IP for the per-IP ceiling. Only the hop our own host
  // appended can be trusted; the left-hand entries are caller-supplied. If the
  // header is absent the per-identity limit still applies.
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    h.get("x-real-ip") ??
    (forwarded ? forwarded.split(",").pop()!.trim() : null);

  const result = await issueResetCode(email, ip);

  if (!result.ok) {
    const mins = Math.ceil(result.retryAfterSeconds / 60);
    return {
      error:
        result.retryAfterSeconds > 90
          ? `Too many requests. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`
          : "A code was just sent. Give it a moment before asking for another.",
    };
  }

  // Deliberately identical whether or not the address has an account.
  return { ok: true, ttlMinutes: RESET_CODE_TTL_MINUTES };
}

/**
 * Verifies the code and signs the user in for long enough to set a password.
 * On success this redirects, so it never returns.
 */
export async function verifyResetCode(input: {
  email: string;
  code: string;
}): Promise<{ error: string } | never> {
  const email = String(input.email ?? "").trim();
  // People paste codes with spaces in them.
  const code = String(input.code ?? "").replace(/\D/g, "");

  // One message for every failure: a wrong code, an expired code, an exhausted
  // envelope and an address with no account must be indistinguishable.
  const failed = {
    error: "That code is not right, or it has expired. Request a new one.",
  };

  if (code.length !== RESET_CODE_LENGTH) return failed;

  const result = await consumeResetCode(email, code);
  if (!result.ok) return failed;

  // Outside any try/catch: redirect() signals by throwing, and catching it
  // here would swallow the navigation.
  redirect("/auth/update-password?flow=recovery");
}

export async function updatePassword(input: {
  password: string;
}): Promise<{ error: string } | never> {
  const password = String(input.password ?? "");
  if (password.length < 12) {
    return {
      error: `That is ${password.length} characters. Twelve or more, and avoid your company name.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This link has expired. Ask for a fresh one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Setting the password failed. Try again." };
  }

  /*
    Land them where they actually belong, the way signIn already does.

    This used to redirect to /console unconditionally, which meant a partner
    accepting their invite set a password and was immediately shown a 404:
    requireStaff() rejects anyone who is not platform staff, so the last step
    of onboarding looked like a broken product. The host decides, because a
    partner's invite link is minted on their own subdomain (see
    inviteIntoTenant in app/console/partners/actions.ts).

    The staff check is the other half. A platform-staff user who somehow sets
    a password on a partner host belongs in the console, not in a portal that
    will show them nothing.
  */
  const host = classifyHost((await headers()).get("host"));
  if (host.kind === "partner") {
    const ctx = await getSessionContext();
    redirect(ctx?.isPlatformStaff ? "/console" : "/portal");
  }
  redirect("/console");
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signedout=1");
}
