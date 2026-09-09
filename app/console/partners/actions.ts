"use server";

import { revalidatePath, updateTag } from "next/cache";

import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTeamInvite } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenant/urls";
import { contrastRatio, type Branding } from "@/lib/tenant/branding";

/**
 * Partner administration. Platform staff only, enforced three times over:
 * the page guard hides the screen, guardAction rejects a direct call, and the
 * database RPC re-derives the caller from auth.uid() and checks
 * is_platform_staff again.
 *
 * The third layer is the one that matters. A server action is an addressable
 * endpoint: a partner admin who learns the id can invoke it without ever
 * loading the page, so the page guard protects a render and nothing else.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type PartnerResult = { error: string } | { ok: true; message?: string };

/**
 * Every branding change invalidates the cached tenant lookup.
 *
 * lib/tenant/resolve.ts caches slug -> tenant for five minutes, which is what
 * makes a partner page cheap. Without this, "configurable without a redeploy"
 * would still mean "configurable, visible in up to five minutes", and an
 * admin would reasonably conclude the save had failed.
 */
function invalidateTenants() {
  /*
    updateTag, not revalidateTag. Next 16 requires a cacheLife profile on
    revalidateTag and expires the entry lazily; updateTag is the Server Action
    form and gives read-your-own-writes, so the admin who just saved sees the
    change on the very next render rather than up to five minutes later. The
    docs are explicit that this is the one to use from an action.
  */
  updateTag("tenants");
  revalidatePath("/console/partners");
}

/** Platform staff only. Distinct from an admin, who administers one tenant. */
async function guardStaff() {
  const guard = await guardAction();
  if (!guard.ok) return guard;
  if (!guard.ctx.isPlatformStaff) {
    return {
      ok: false as const,
      error: "Only the Prime PEO Brokers team can manage partners.",
    };
  }
  return guard;
}

/**
 * Creates a partner tenant, with its pipeline, in one transaction.
 *
 * The RPC seeds lead_stages as part of the same statement, which is not a
 * convenience: a tenant with no stages rejects every submission on its
 * subdomain, so the visitor completes the whole discovery flow and the insert
 * fails at the end. A two-step create could leave exactly that state.
 */
export async function createPartner(input: {
  slug: string;
  name: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const slug = String(input.slug ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();

  if (!name) return { error: "Give the partner a company name." };
  if (name.length > 200) {
    return { error: "That name is too long. Keep it under 200 characters." };
  }
  if (!/^[a-z0-9-]{2,63}$/.test(slug)) {
    return {
      error:
        "The subdomain must be 2 to 63 characters: lowercase letters, numbers and hyphens only.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_partner", {
    p_slug: slug,
    p_name: name,
  });

  if (error) return { error: rpcMessage(error.message, "Could not create that partner.") };

  invalidateTenants();
  return {
    ok: true,
    message: `${name} created. Their portal is ${slug}.${process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000"}`,
  };
}

/**
 * Saves a partner's branding.
 *
 * Colour validation happens here rather than in the database, and refuses
 * rather than warns below 3:1. app/globals.css documents that the house
 * orange is only 3.73:1 on white, which is why it is restricted to large
 * text, bold button labels and the mark. A partner picking a pale accent
 * would produce a portal failing WCAG AA on every label, and "configurable
 * branding" must not mean "a tool for building inaccessible portals".
 */
export async function savePartnerBranding(input: {
  tenantId: string;
  companyName: string;
  shortName: string;
  supportEmail: string;
  accent: string;
  ink: string;
  dark: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };

  const companyName = String(input.companyName ?? "").trim();
  const shortName = String(input.shortName ?? "").trim();
  const supportEmail = String(input.supportEmail ?? "").trim().toLowerCase();

  if (companyName.length > 120) {
    return { error: "That company name is too long. Keep it under 120 characters." };
  }
  if (shortName.length > 40) {
    return { error: "That short name is too long. Keep it under 40 characters." };
  }
  if (supportEmail && !EMAIL_RE.test(supportEmail)) {
    return { error: "That support address is not a valid email." };
  }

  const colors: Record<string, string> = {};
  for (const [key, raw] of [
    ["accent", input.accent],
    ["ink", input.ink],
    ["dark", input.dark],
  ] as const) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) continue;
    if (!HEX_RE.test(v)) {
      return { error: `The ${key} colour must be a hex value like #1a2b3c.` };
    }
    colors[key] = v;
  }

  /*
    Contrast, against the portal's own surface (--pv-surface is white). Refuse
    below 3:1, which is unreadable at any size; warn between 3:1 and 4.5:1,
    which is the band the house orange itself sits in and is acceptable only
    for large text and bold labels.
  */
  const warnings: string[] = [];
  if (colors.accent) {
    const ratio = contrastRatio(colors.accent, "#ffffff");
    if (ratio < 3) {
      return {
        error: `That accent scores ${ratio.toFixed(1)}:1 on white, which is unreadable. Choose a darker colour (3:1 minimum).`,
      };
    }
    if (ratio < 4.5) {
      warnings.push(
        `the accent is ${ratio.toFixed(1)}:1 on white, so keep it to buttons and large text`,
      );
    }
  }
  if (colors.ink) {
    const ratio = contrastRatio(colors.ink, "#ffffff");
    if (ratio < 4.5) {
      return {
        error: `Body text scores ${ratio.toFixed(1)}:1 on white. Ink must reach 4.5:1 to be readable.`,
      };
    }
  }

  const branding: Branding = {};
  if (companyName) branding.companyName = companyName;
  if (shortName) branding.shortName = shortName;
  if (supportEmail) branding.supportEmail = supportEmail;
  if (Object.keys(colors).length) branding.colors = colors;

  // The existing logo survives a colour-only save: the form does not carry it.
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenants")
    .select("branding")
    .eq("id", tenantId)
    .maybeSingle();
  const existingLogo = (current?.branding as Branding | null)?.logo;
  if (existingLogo) branding.logo = existingLogo;

  const { error } = await supabase.rpc("set_partner_branding", {
    p_tenant_id: tenantId,
    p_branding: branding,
  });
  if (error) return { error: rpcMessage(error.message, "Could not save that branding.") };

  invalidateTenants();
  return {
    ok: true,
    message: warnings.length ? `Saved, but ${warnings.join("; ")}.` : "Branding saved.",
  };
}

/**
 * Suspends or restores a partner.
 *
 * Suspending does two things, and both are needed. The tenant flag 404s the
 * subdomain, but tenant_scope() reads profiles, not tenants, so a suspended
 * partner's users would still reach their data through PostgREST with the
 * NEXT_PUBLIC_ key. Deactivating their profiles is what actually revokes
 * access, on their next request.
 */
export async function setPartnerSuspended(input: {
  tenantId: string;
  suspended: boolean;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };
  const suspended = input.suspended === true;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_partner_suspended", {
    p_tenant_id: tenantId,
    p_suspended: suspended,
  });
  if (error) return { error: rpcMessage(error.message, "Could not change that partner.") };

  /*
    The portal is closed by the flag above; access is revoked here. Uses the
    service-role client because profiles has no UPDATE policy at all (0005
    revoked it and granted only full_name), so this cannot go through the
    session client, and there is no RPC for it.
  */
  const admin = createAdminClient();
  const { error: pe } = await admin
    .from("profiles")
    .update({ deactivated_at: suspended ? new Date().toISOString() : null })
    .eq("tenant_id", tenantId);
  if (pe) {
    console.error("[partners] could not update partner profiles", pe);
    return {
      error: suspended
        ? "The portal is closed, but their logins may still work. Try again."
        : "The portal is open, but their logins may still be disabled. Try again.",
    };
  }

  invalidateTenants();
  return {
    ok: true,
    message: suspended
      ? "Partner suspended. Their portal is closed and their logins are disabled."
      : "Partner restored. Their portal and logins are active again.",
  };
}

/**
 * Invites the first (or another) user into a partner tenant.
 *
 * redirectTo is built from the PARTNER's origin, not the house origin. This is
 * the detail that would otherwise be missed: the confirm route sets the auth
 * cookie on whichever host it runs on, so a house-origin link leaves the
 * partner signed in on the marketing site and signed out of their own portal.
 *
 * invited_by is passed, but note handle_new_user DERIVES is_platform_staff and
 * requires the resolved tenant to be the founding one, so a partner invite can
 * never mint cross-tenant access however this is called.
 */
export async function invitePartnerUser(input: {
  tenantId: string;
  email: string;
  fullName: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const tenantId = String(input.tenantId ?? "");
  const email = String(input.email ?? "").trim().toLowerCase();
  const fullName = String(input.fullName ?? "").trim();

  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (fullName.length > 120) {
    return { error: "That name is too long. Keep it under 120 characters." };
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug, name, is_house, suspended_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return { error: "That partner no longer exists." };
  if (tenant.suspended_at) {
    return { error: "That partner is suspended. Restore them before inviting anyone." };
  }

  const admin = createAdminClient();
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName || null,
        // A partner admin can manage their own portal users later. It grants
        // nothing outside their tenant: is_platform_staff stays false.
        role: "admin",
        tenant_id: tenantId,
        invited_by: ctx.userId,
      },
      redirectTo: `${tenantOrigin(tenant.slug, tenant.is_house === true)}/auth/confirm?type=invite`,
    },
  });

  if (error || !linkData?.properties?.action_link) {
    const raw = (error?.message ?? "").toLowerCase();
    if (raw.includes("already registered") || raw.includes("already been registered")) {
      return {
        error:
          "That address already has an account. Ask them to sign in at their portal, or use a different address.",
      };
    }
    console.error("[partners] invite link generation failed", error);
    return { error: "Could not create the invite. Try again shortly." };
  }

  const delivery = await sendTeamInvite({
    to: email,
    acceptUrl: linkData.properties.action_link,
    invitedBy: ctx.fullName || ctx.email || "Prime PEO Brokers",
    role: "admin",
  });

  if (!delivery.ok) {
    // generateLink is not idempotent, so a left-behind user makes every retry
    // fail with "already registered" for someone who never got a mail.
    try {
      await admin.auth.admin.deleteUser(linkData.user.id);
    } catch (e) {
      console.error("[partners] cleanup after failed invite delivery", e);
    }
    return { error: "Could not send the invite email. Try again shortly." };
  }

  invalidateTenants();
  return { ok: true, message: `Invite sent to ${email}.` };
}

/**
 * Routes a lead to another partner.
 *
 * All of the work is in the RPC, because four things have to move together:
 * the submission, its stage (the stage FK is composite, and the destination
 * may not have that slug), its notes and events (composite FKs since 0006),
 * and its assignee (who may not be able to own it in the new tenant).
 */
export async function routeLead(input: {
  submissionId: string;
  toTenantId: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const submissionId = String(input.submissionId ?? "");
  const toTenantId = String(input.toTenantId ?? "");
  if (!UUID_RE.test(submissionId)) return { error: "That lead is not valid." };
  if (!UUID_RE.test(toTenantId)) return { error: "That destination is not valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("route_submission", {
    p_submission_id: submissionId,
    p_to_tenant: toTenantId,
  });
  if (error) return { error: rpcMessage(error.message, "Could not route that lead.") };

  revalidatePath("/console");
  revalidatePath("/console/leads/[id]", "page");
  revalidatePath("/console/partners");
  return { ok: true, message: "Lead routed." };
}

/**
 * Passes through a message the database wrote for a person to read, and
 * swallows anything else.
 *
 * Same approach as the team actions: the RPCs raise sentences an admin can act
 * on ("That subdomain is reserved"), and flattening those to "something went
 * wrong" would hide the one piece of information that helps.
 */
function rpcMessage(raw: string, fallback: string): string {
  const known = [
    "Only the Prime PEO Brokers team",
    "subdomain",
    "already uses",
    "no longer exists",
    "already with",
    "not an active partner",
    "no lead stages configured",
    "cannot suspend",
    "company name",
    "Unknown branding key",
  ];
  if (known.some((k) => raw.toLowerCase().includes(k.toLowerCase()))) return raw;
  console.error("[partners] rpc failed", raw);
  return fallback;
}
