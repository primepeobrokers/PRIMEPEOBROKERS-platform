"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmUrl, houseOrigin as siteUrl } from "@/lib/tenant/urls";
import { createClient } from "@/lib/supabase/server";
import { sendTeamInvite } from "@/lib/email";
import { houseBrand } from "@/lib/tenant/email-brand";

/**
 * Team management. Every action is admin-only, enforced three times over:
 * the page guard hides the screen, guardAction("admin") rejects a direct
 * call to the action, and the database RPC re-derives the caller from
 * auth.uid() and checks the role again.
 *
 * The third layer is the one that matters. A server action is an addressable
 * endpoint: a member who knows the id can invoke it without ever loading the
 * page, so the page guard protects a render and nothing else.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same shape the sign-in and reset paths use. Deliberately not a second one. */
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export type TeamResult = { error: string } | { ok: true; message?: string };

/*
  The console is staff-only and apex-only (requireStaff plus the proxy
  rewrite), so an invite sent from here always belongs on the house origin.
  Using the shared helper rather than a local copy of the env read, so that
  when partner-side invites arrive they change one function: a partner invite
  built on the house origin would set the auth cookie on the wrong host, and
  the invitee would land signed in on the marketing site and signed out of
  their own portal.
*/

/**
 * Invites a teammate by email.
 *
 * The only path in the console that touches the service-role client. It has
 * to: creating an auth user is not something RLS can authorise, and
 * inviteUserByEmail is an admin API. The guard above it is therefore the only
 * thing standing between a member and account creation, which is why it runs
 * before anything else in the function.
 *
 * The role travels in the invite metadata and is read back by
 * handle_new_user, which trusts it ONLY because GoTrue sets invited_at on
 * this path. See migration 0005 section 9.
 */
export async function inviteTeammate(input: {
  email: string;
  fullName: string;
  role: "admin" | "member";
}): Promise<TeamResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const email = String(input.email ?? "").trim().toLowerCase();
  const fullName = String(input.fullName ?? "").trim();
  const role = input.role === "admin" ? "admin" : "member";

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (fullName.length > 120) {
    return { error: "That name is too long. Keep it under 120 characters." };
  }

  const supabase = await createClient();

  /*
    Check for an existing teammate through the RLS-bound client first, so the
    common "they are already here" case never reaches the admin API. RLS
    scopes this to the caller's tenant, which is what we want: an address
    belonging to another tenant is not this admin's business.
  */
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, deactivated_at")
    .ilike("email", email)
    .maybeSingle();

  if (existing && !existing.deactivated_at) {
    return { ok: true, message: "They are already on your team." };
  }

  if (existing?.deactivated_at) {
    return {
      error:
        "That person was removed from the team. Restore them from the Removed tab instead of re-inviting.",
    };
  }

  /*
    The invite goes out through Resend on the brand's sender, not Supabase's
    mailer: generateLink creates the auth user and the accept token without
    sending anything, and the branded template in lib/email.ts carries the
    link. The token and the acceptance flow are exactly what the stock mailer
    would have sent; only the envelope changed. This also removes the
    per-hour cap on Supabase's mailer that the old path was subject to.

    Order matters here. Resend availability is checked first (via the send
    result), and a failed delivery deletes the just-created auth user:
    generateLink is not idempotent, so leaving the user behind would make
    every retry fail with "already registered" for someone who never got a
    mail. The delete cascades the profile row, restoring a clean slate.
  */
  const admin = createAdminClient();
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      /*
        invited_by is what lets handle_new_user DERIVE is_platform_staff
        (migration 0009). The flag is never read from this metadata: an
        invitee could otherwise be handed read access to every tenant. The
        trigger requires the inviter to be platform staff AND the tenant to be
        the founding one, so a partner admin's invite can only ever produce a
        partner-scoped account. Omitting this field degrades to a plain
        member, which is the safe default but also means new staff would lose
        cross-partner visibility, so it has to be sent.
      */
      data: {
        full_name: fullName || null,
        role,
        tenant_id: ctx.tenantId,
        invited_by: ctx.userId,
      },
      redirectTo: `${siteUrl()}/auth/confirm?type=invite`,
    },
  });

  if (error || !linkData?.properties?.hashed_token) {
    const raw = (error?.message ?? "").toLowerCase();
    if (raw.includes("already been registered") || raw.includes("already registered")) {
      return {
        error:
          "That address already has an account elsewhere. Ask them to sign in, or use a different address.",
      };
    }
    console.error("[team] invite link generation failed", error);
    return { error: "Could not create the invite. Try again shortly." };
  }

  const delivery = await sendTeamInvite({
    to: email,
    acceptUrl: confirmUrl(siteUrl(), linkData.properties.hashed_token),
    invitedBy: ctx.fullName || ctx.email || "A teammate",
    role,
    brand: houseBrand(),
    destination: "console",
  });

  if (!delivery.ok) {
    try {
      await admin.auth.admin.deleteUser(linkData.user.id);
    } catch (e) {
      console.error("[team] cleanup after failed invite delivery", e);
    }
    return { error: "Could not send the invite email. Try again shortly." };
  }

  await logTeamEvent(ctx.tenantId, ctx, "invited", `${email} invited as ${role}`);
  revalidatePath("/console/team");
  return { ok: true, message: `Invite sent to ${email}.` };
}

/**
 * Promotes or demotes a teammate.
 *
 * The last-admin and self-change guards live in the database RPC, not here.
 * They have to: the rule counts rows, so it is only correct under the
 * advisory lock the RPC takes (migration 0006 section 2). This function is a
 * thin, well-behaved caller of it.
 */
export async function changeRole(input: {
  profileId: string;
  role: "admin" | "member";
}): Promise<TeamResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };

  const profileId = String(input.profileId ?? "");
  const role = input.role === "admin" ? "admin" : "member";
  if (!UUID_RE.test(profileId)) return { error: "That teammate is not valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_teammate_role", {
    p_profile_id: profileId,
    p_role: role,
  });
  if (error) return { error: rpcMessage(error.message, "Could not change that role.") };

  revalidatePath("/console/team");
  return { ok: true };
}

/**
 * Removes a teammate. Soft: the profile row stays so their name keeps
 * resolving in every note and event they wrote, and their leads are released
 * in the same transaction so none is left owned by someone with no access.
 */
export async function removeTeammate(input: {
  profileId: string;
  reassignTo: string | null;
}): Promise<TeamResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };

  const profileId = String(input.profileId ?? "");
  const reassignTo = input.reassignTo ? String(input.reassignTo) : null;
  if (!UUID_RE.test(profileId)) return { error: "That teammate is not valid." };
  if (reassignTo !== null && !UUID_RE.test(reassignTo)) {
    return { error: "That teammate is not valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_teammate", {
    p_profile_id: profileId,
    p_reassign_to: reassignTo,
  });
  if (error) {
    return { error: rpcMessage(error.message, "Could not remove that teammate.") };
  }

  /*
    Kill their sessions immediately. Without this they keep working access
    until their JWT expires, which can be an hour: a removed teammate reading
    leads for an hour is a real gap, and an easy one to leave out because
    everything looks correct without it.

    Best effort on purpose. The removal itself already committed, and
    current_user_role() returns null for them from the next request onward, so
    a failure here narrows to "their current token still works briefly"
    rather than "the removal did not happen".
  */
  try {
    const admin = createAdminClient();
    await admin.auth.admin.signOut(profileId, "global");
  } catch (e) {
    console.error("[team] session revocation failed after removal", e);
  }

  const moved = typeof data === "number" ? data : 0;
  revalidatePath("/console/team");
  revalidatePath("/console");
  return {
    ok: true,
    message:
      moved > 0
        ? `Removed. ${moved} lead${moved === 1 ? "" : "s"} reassigned.`
        : "Removed from the team.",
  };
}

/** Restores a removed teammate, so a mis-click is recoverable. */
export async function restoreTeammate(input: {
  profileId: string;
}): Promise<TeamResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const profileId = String(input.profileId ?? "");
  if (!UUID_RE.test(profileId)) return { error: "That teammate is not valid." };

  /*
    Restoring writes profiles.deactivated_at, which migration 0006 revoked
    from authenticated (only full_name is grantable, so an escalation policy
    added later still cannot reach role or deactivation). So this goes
    through the admin client, guarded above, with the tenant checked by hand
    because the service-role client bypasses RLS.
  */
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, email, deactivated_at")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return { error: "That teammate is not on your team." };
  if (!target.deactivated_at) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ deactivated_at: null, deactivated_by: null })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId);
  if (error) {
    console.error("[team] restore failed", error);
    return { error: "Could not restore that teammate." };
  }

  await logTeamEvent(
    ctx.tenantId,
    ctx,
    "reactivated",
    `${target.full_name || target.email || "A teammate"} restored to the team`,
  );
  revalidatePath("/console/team");
  return { ok: true, message: "Restored." };
}

/**
 * Writes a tenant_events row for the actions that have no RPC of their own.
 *
 * set_teammate_role and remove_teammate log themselves inside the database,
 * where the write cannot be forgotten or lost to a failure after the fact.
 * Invite and restore have no RPC, so they log here, through the admin client
 * because the insert policy requires is_admin() and the caller is already
 * verified as one.
 */
async function logTeamEvent(
  tenantId: string,
  ctx: { userId: string; email: string; fullName: string | null },
  action: string,
  detail: string,
): Promise<void> {
  /*
    supabase-js resolves with { error } rather than throwing, so a try/catch
    alone silently discards a failed audit write: the catch never runs and
    nothing is logged. The error has to be destructured and checked. The
    try/catch stays for the genuinely thrown cases (a missing service-role
    key, a transport failure).
  */
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("tenant_events").insert({
      tenant_id: tenantId,
      actor_id: ctx.userId,
      actor: ctx.fullName || ctx.email || "staff",
      action,
      detail,
    });
    if (error) console.error("[team] audit write rejected", action, error);
  } catch (e) {
    // An audit line is worth having, but not worth failing the action over.
    console.error("[team] audit write failed", action, e);
  }
}

/**
 * Surfaces the guard messages the RPCs raise, which are written for people
 * ("That is the only admin on the team. Promote someone else first."), while
 * hiding anything unexpected behind a generic line.
 */
function rpcMessage(raw: string, fallback: string): string {
  const known = [
    "only admin",
    "your own role",
    "not on your team",
    "Only an admin",
    "Cannot reassign",
  ];
  if (known.some((k) => raw.toLowerCase().includes(k.toLowerCase()))) {
    return raw;
  }
  console.error("[team] rpc failed", raw);
  return fallback;
}
