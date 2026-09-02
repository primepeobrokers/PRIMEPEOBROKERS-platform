import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "member";

export interface SessionContext {
  userId: string;
  email: string;
  tenantId: string;
  role: Role;
  fullName: string | null;
}

/**
 * Signed-in context, or null. Never throws and never redirects, so layouts and
 * components can branch on it.
 *
 * Reads through the session client, so the profile lookup is itself scoped by
 * RLS. A deactivated teammate resolves to null: their profile row still exists
 * (their name has to keep rendering in old notes and events) but they are not
 * a member of anything, so treating the row as absent here is the truthful
 * answer and it means every caller gets the check for free.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  // getUser, not getSession: getSession trusts whatever is in the cookie,
  // getUser revalidates it against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role, full_name, deactivated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.deactivated_at) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: profile.tenant_id,
    role: profile.role === "admin" ? "admin" : "member",
    fullName: profile.full_name ?? null,
  };
}

/**
 * Signed-in context, or a redirect to the login page. For pages and layouts.
 *
 * `next` round-trips the caller back after signing in. It is only ever a path
 * this app generates, and signIn re-checks that it starts with /console before
 * honouring it, so it cannot become an open redirect.
 */
export async function requireUser(next = "/console"): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(next)}`);
  return ctx;
}

/**
 * Admin context, or a 404. For admin-only pages.
 *
 * notFound rather than a redirect to /console: a member who guesses the URL
 * should not learn whether the route exists, and the 404 renders inside the
 * console layout instead of throwing them out of the app.
 */
export async function requireAdminPage(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/console");
  if (ctx.role !== "admin") notFound();
  return ctx;
}

export type ActionGuard =
  | { ok: true; ctx: SessionContext }
  | { ok: false; error: string };

/**
 * Caller context for a server action, as a result rather than a redirect.
 *
 * Actions in this app return `{ error }` and the client renders it inline. A
 * redirect() thrown from inside startTransition would unmount the component
 * mid-mutation and take the user's half-typed note with it, so an auth failure
 * has to come back as a value.
 *
 * The message deliberately does not distinguish "not signed in" from "not an
 * admin". Both are the same thing to the person reading it, and the difference
 * is only useful to someone probing.
 */
export async function guardAction(need?: Role): Promise<ActionGuard> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }
  if (need === "admin" && ctx.role !== "admin") {
    return {
      ok: false,
      error: "You do not have permission to do that. Ask an admin on your team.",
    };
  }
  return { ok: true, ctx };
}
