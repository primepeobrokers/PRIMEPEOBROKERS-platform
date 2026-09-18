"use server";

import { revalidatePath, updateTag } from "next/cache";

import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTeamInvite } from "@/lib/email";
import { confirmUrl, tenantOrigin } from "@/lib/tenant/urls";
import { contrastRatio, parseBranding, type Branding } from "@/lib/tenant/branding";
import { brandFor } from "@/lib/tenant/email-brand";
import { imageInfo } from "@/lib/tenant/image-size";
import type { SessionContext } from "@/lib/auth/session";

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
  /** The partner's work address: reply-to on their leads' mail, and where their new-lead alerts go. */
  contactEmail?: string;
  /** Send the first login to this address as part of the same step. */
  inviteEmail?: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const slug = String(input.slug ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  const contactEmail = String(input.contactEmail ?? "").trim().toLowerCase();
  const inviteEmail = String(input.inviteEmail ?? "").trim().toLowerCase();

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
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return { error: "That partner email is not a valid address." };
  }
  if (inviteEmail && !EMAIL_RE.test(inviteEmail)) {
    return { error: "That login email is not a valid address." };
  }

  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("create_partner", {
    p_slug: slug,
    p_name: name,
  });

  if (error || typeof tenantId !== "string") {
    return { error: rpcMessage(error?.message ?? "", "Could not create that partner.") };
  }

  /*
    The two follow-ups are separate calls, not part of the create transaction,
    and that is acceptable: the tenant row exists and is visible in the table
    whichever of them fails, and both can be redone from the partner's panel.
    What must NOT be split is the tenant and its stages, and the RPC keeps
    those together.
  */
  const notes: string[] = [];

  if (contactEmail) {
    const { error: be } = await supabase.rpc("set_partner_branding", {
      p_tenant_id: tenantId,
      p_branding: { supportEmail: contactEmail } satisfies Branding,
    });
    if (be) {
      console.error("[partners] contact email not saved on create", be.message);
      notes.push("their email could not be saved; add it under Branding");
    }
  }

  if (inviteEmail) {
    const sent = await inviteIntoTenant({
      ctx: guard.ctx,
      tenant: { id: tenantId, slug, name, branding: contactEmail ? { supportEmail: contactEmail } : {}, isHouse: false },
      email: inviteEmail,
      fullName: "",
    });
    if ("error" in sent) notes.push(`the login was not sent (${sent.error.replace(/\.$/, "")}); use Issue a login`);
  }

  invalidateTenants();
  const host = `${slug}.${process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000"}`;
  return {
    ok: true,
    message: notes.length
      ? `${name} created at ${host}, but ${notes.join(", and ")}.`
      : inviteEmail
        ? `${name} created at ${host}. Login sent to ${inviteEmail}.`
        : `${name} created. Their portal is ${host}`,
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
    return { error: "That partner email is not a valid address." };
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
  const existingLogo = (await currentBranding(tenantId)).logo;
  if (existingLogo) branding.logo = existingLogo;

  const supabase = await createClient();
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
 * Everything savePartnerBranding and the logo actions must carry forward
 * from the stored row. Listed explicitly rather than spread, so a key the RPC
 * allowlist does not know can never be echoed back and fail the save.
 */
async function currentBranding(tenantId: string): Promise<Branding> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("branding, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return {};
  const parsed = parseBranding(data.branding, data.name);
  const out: Branding = {};
  // parseBranding fills companyName from the tenant name; do not persist that.
  const raw = (data.branding ?? {}) as Record<string, unknown>;
  if (typeof raw.companyName === "string" && parsed.companyName) out.companyName = parsed.companyName;
  if (parsed.shortName) out.shortName = parsed.shortName;
  if (parsed.supportEmail) out.supportEmail = parsed.supportEmail;
  if (parsed.colors) out.colors = parsed.colors;
  if (parsed.logo) out.logo = parsed.logo;
  return out;
}

const LOGO_BUCKET = "tenant-logos";
const LOGO_MAX_BYTES = 200 * 1024;

/**
 * Uploads a partner's logo and points their branding at it.
 *
 * The file type is decided by the bytes (lib/tenant/image-size.ts), not by
 * the name or the browser's MIME type, and only PNG and WebP pass. The bucket
 * enforces the same allowlist and size cap, so a bypass here still fails
 * there; this layer exists to give staff a sentence instead of a 400.
 *
 * Storage goes through the service-role client: the bucket is public to READ
 * (an unauthenticated portal header loads it) but has no write policy for
 * anyone, and the staff check has already happened above.
 */
export async function uploadPartnerLogo(formData: FormData): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG or WebP file." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: `That file is ${Math.ceil(file.size / 1024)}KB. Logos must be 200KB or smaller.` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = imageInfo(bytes);
  if (!info) {
    return { error: "That is not a PNG or WebP image. SVG is not accepted." };
  }

  const before = await currentBranding(tenantId);
  const path = `${tenantId}/${Date.now()}.${info.kind}`;

  const admin = createAdminClient();
  const { error: ue } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, Buffer.from(bytes), {
      contentType: info.kind === "png" ? "image/png" : "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (ue) {
    console.error("[partners] logo upload failed", ue.message);
    return { error: "Could not store that file. Try again shortly." };
  }

  const branding: Branding = {
    ...before,
    logo: { path, width: info.width, height: info.height, displayHeight: 28 },
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_partner_branding", {
    p_tenant_id: tenantId,
    p_branding: branding,
  });
  if (error) {
    // Do not leave the orphan behind; the branding still points at the old one.
    await admin.storage.from(LOGO_BUCKET).remove([path]);
    return { error: rpcMessage(error.message, "Could not save that logo.") };
  }

  // The replaced file is unreferenced now. Best-effort: an orphan costs a
  // few KB, a failed save would have cost the logo.
  if (before.logo && before.logo.path !== path) {
    await admin.storage.from(LOGO_BUCKET).remove([before.logo.path]);
  }

  invalidateTenants();
  return { ok: true, message: `Logo saved (${info.width} × ${info.height}).` };
}

/** Removes a partner's logo; the header falls back to their name. */
export async function removePartnerLogo(input: { tenantId: string }): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };

  const before = await currentBranding(tenantId);
  if (!before.logo) return { ok: true, message: "No logo to remove." };

  const { logo, ...rest } = before;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_partner_branding", {
    p_tenant_id: tenantId,
    p_branding: rest,
  });
  if (error) return { error: rpcMessage(error.message, "Could not remove that logo.") };

  await createAdminClient().storage.from(LOGO_BUCKET).remove([logo.path]);

  invalidateTenants();
  return { ok: true, message: "Logo removed. Their name is shown instead." };
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
    .select("slug, name, branding, is_house, suspended_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return { error: "That partner no longer exists." };
  if (tenant.suspended_at) {
    return { error: "That partner is suspended. Restore them before inviting anyone." };
  }

  const sent = await inviteIntoTenant({
    ctx,
    tenant: {
      id: tenantId,
      slug: tenant.slug,
      name: tenant.name,
      branding: parseBranding(tenant.branding, tenant.name),
      isHouse: tenant.is_house === true,
    },
    email,
    fullName,
  });
  if ("error" in sent) return sent;

  invalidateTenants();
  return { ok: true, message: `Invite sent to ${email}.` };
}

/**
 * Mints an invite link for a tenant and mails it in that tenant's brand.
 * Shared by the Invite panel and by create-in-one-pass. Inputs are already
 * validated and the caller is already known to be platform staff.
 */
async function inviteIntoTenant(input: {
  ctx: SessionContext;
  tenant: { id: string; slug: string; name: string; branding: Branding; isHouse: boolean };
  email: string;
  fullName: string;
}): Promise<PartnerResult> {
  const { ctx, tenant, email, fullName } = input;

  const admin = createAdminClient();
  const origin = tenantOrigin(tenant.slug, tenant.isHouse);
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName || null,
        // A partner admin can manage their own portal users later. It grants
        // nothing outside their tenant: is_platform_staff stays false.
        role: "admin",
        tenant_id: tenant.id,
        invited_by: ctx.userId,
      },
      redirectTo: `${origin}/auth/confirm?type=invite`,
    },
  });

  if (error || !linkData?.properties?.hashed_token) {
    const raw = (error?.message ?? "").toLowerCase();
    if (raw.includes("already registered") || raw.includes("already been registered")) {
      /*
        The address already has an account, which is the ordinary "resend it,
        they lost the link" case. An invite token cannot be minted twice, so
        send a recovery link instead: it lands on the same confirm route, sets
        a session, and drops them on the set-password screen. Identical
        experience, and it works whether or not they ever accepted.

        Guarded on the account actually belonging to THIS partner, so a typo
        matching someone else's address cannot mail them a working link into a
        portal they have nothing to do with.
      */
      return resendIntoTenant({ ctx, tenant, email, origin });
    }
    console.error("[partners] invite link generation failed", error);
    return { error: "Could not create the invite. Try again shortly." };
  }

  // In the partner's own brand: the invitee is joining THEIR portal, and the
  // first thing they see from it should carry their name, not the house's.
  const delivery = await sendTeamInvite({
    to: email,
    acceptUrl: confirmUrl(
      tenantOrigin(tenant.slug, tenant.isHouse),
      linkData.properties.hashed_token,
    ),
    invitedBy: ctx.fullName || ctx.email || "Prime PEO Brokers",
    role: "admin",
    brand: brandFor(tenant),
    destination: "portal",
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

  return { ok: true };
}

/**
 * Sends a fresh sign-in link to someone who already has an account on this
 * partner. The "resend" half of inviteIntoTenant.
 *
 * A recovery link rather than an invite: GoTrue will not mint a second invite
 * for an existing user, and recovery lands on the same /auth/confirm route,
 * which sets the session and forwards to the set-password screen. To the
 * recipient it is the same email and the same journey.
 */
async function resendIntoTenant(input: {
  ctx: SessionContext;
  tenant: { id: string; slug: string; name: string; branding: Branding; isHouse: boolean };
  email: string;
  origin: string;
}): Promise<PartnerResult> {
  const { ctx, tenant, email, origin } = input;
  const admin = createAdminClient();

  /*
    The account must belong to THIS partner. Without this check a typo that
    happens to match a staff address, or another partner's user, would be sent
    a link that signs them in and lands them on a portal that is not theirs.
    Read service-role: the row may be another tenant's, which RLS would hide,
    and "not found" is exactly the answer we must not give ourselves here.
  */
  /*
    Looked up by email on profiles, NOT by scanning auth.admin.listUsers():
    that is paginated, so any page size is a silent cap, and past it a real
    user reads as "not found" and the resend refuses someone who exists.
    profiles carries the email (0005) and is the table that answers the
    question actually being asked, which is "is this person on THIS partner".
  */
  const { data: profile } = await admin
    .from("profiles")
    .select("id, tenant_id, deactivated_at")
    .ilike("email", email)
    .maybeSingle<{ id: string; tenant_id: string; deactivated_at: string | null }>();

  if (!profile || profile.tenant_id !== tenant.id) {
    return {
      error:
        "That address already has an account somewhere else. Use a different one.",
    };
  }
  if (profile.deactivated_at) {
    return {
      error: "That person was removed. Restore their access first, then resend.",
    };
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/confirm?type=recovery` },
  });
  if (error || !linkData?.properties?.hashed_token) {
    console.error("[partners] resend link generation failed", error);
    return { error: "Could not create the link. Try again shortly." };
  }

  const delivery = await sendTeamInvite({
    to: email,
    acceptUrl: confirmUrl(origin, linkData.properties.hashed_token, "recovery"),
    invitedBy: ctx.fullName || ctx.email || "Prime PEO Brokers",
    role: "admin",
    brand: brandFor(tenant),
    destination: "portal",
  });
  if (!delivery.ok) {
    return { error: "Could not send that email. Try again shortly." };
  }

  // No cleanup branch here, unlike the invite path: this user already existed,
  // so a failed send must never delete them.
  return { ok: true, message: `A fresh link was sent to ${email}.` };
}

/**
 * Removes or restores one partner user's access.
 *
 * Deactivates the profile rather than deleting the account, matching how the
 * house team works (0005): their name has to keep resolving on any note or
 * event they left behind, and getSessionContext() already treats a
 * deactivated profile as no session at all.
 */
export async function setPartnerUserActive(input: {
  tenantId: string;
  profileId: string;
  active: boolean;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  const profileId = String(input.profileId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };
  if (!UUID_RE.test(profileId)) return { error: "That person is not valid." };
  const active = input.active === true;

  const admin = createAdminClient();

  /*
    This screen manages PARTNERS. The house team is managed at /console/team,
    which has its own last-admin and self-removal rules, so refusing the house
    tenant here keeps those from being bypassed through this route. The UI
    never offers it, but the action is an addressable endpoint.
  */
  const { data: target } = await admin
    .from("tenants")
    .select("is_house")
    .eq("id", tenantId)
    .maybeSingle<{ is_house: boolean | null }>();
  if (!target) return { error: "That partner no longer exists." };
  if (target.is_house) {
    return { error: "Manage your own team from the Team screen." };
  }

  /*
    Pin the update to BOTH ids. A profile id alone would let a mistyped or
    tampered value deactivate a user on another tenant, including the house
    team, since this runs service-role and bypasses RLS entirely.
  */
  const { data, error } = await admin
    .from("profiles")
    .update({
      deactivated_at: active ? null : new Date().toISOString(),
      deactivated_by: active ? null : guard.ctx.userId,
    })
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .select("email");

  if (error) {
    console.error("[partners] could not change partner user access", error);
    return { error: "Could not change that person's access. Try again." };
  }
  // A zero-row update is not an error in PostgREST, so assert the row moved.
  if (!data || data.length === 0) {
    return { error: "That person is not on this partner." };
  }

  revalidatePath("/console/partners");
  const who = data[0]?.email ?? "That person";
  return {
    ok: true,
    message: active ? `${who} can sign in again.` : `${who} no longer has access.`,
  };
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
