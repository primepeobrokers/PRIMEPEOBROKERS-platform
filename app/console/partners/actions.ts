"use server";

import { revalidatePath, updateTag } from "next/cache";

import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTeamInvite } from "@/lib/email";
import { confirmUrl, tenantOrigin } from "@/lib/tenant/urls";
import {
  __testables as brandingRules,
  LOGO_MAX_DIMENSION,
  contrastRatio,
  parseBranding,
  type Branding,
} from "@/lib/tenant/branding";
import { brandFor } from "@/lib/tenant/email-brand";
import type { SessionContext } from "@/lib/auth/session";
import { CONSOLE_EMAIL_RE, escapeLike } from "@/lib/console/email-match";

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
/*
  EMAIL_RE and escapeLike live in lib/console/email-match.ts, not here: this
  file is "use server", where every export must be an async action, and both
  are pure and unit-tested. See that module for why the wildcard characters
  are excluded twice over.
*/
const EMAIL_RE = CONSOLE_EMAIL_RE;
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
  crmPartnerName: string;
  /** Named in the footer disclosure as the referral partner. */
  legalName: string;
  /** Where "Contact" and "Talk to an advisor" go: an https URL or an email. */
  contactUrl: string;
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

  const crmPartnerName = String(input.crmPartnerName ?? "").trim();
  if (crmPartnerName.length > 120) {
    return { error: "That CRM name is too long. Keep it under 120 characters." };
  }

  const legalName = String(input.legalName ?? "").trim();
  if (legalName.length > 200) {
    return { error: "That legal name is too long. Keep it under 200 characters." };
  }

  /*
    The same rule parseBranding applies on read, run here so staff get a
    sentence instead of a value that silently vanishes on save. It is rendered
    as an href on a public page, so https and email only: no javascript:, no
    plain http.
  */
  const rawContact = String(input.contactUrl ?? "").trim();
  const contactUrl = rawContact ? brandingRules.safeContact(rawContact) : undefined;
  if (rawContact && !contactUrl) {
    return {
      error: "The contact must be an https:// link or an email address.",
    };
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
  /*
    `dark` is the ground for the compare table, the closing panel and the
    footer, all of which set white text. The check is the reverse of the
    others: it must be dark ENOUGH, not light enough.

    Contrast alone does not catch the failure this guards against. A partner
    once stored #19191a, a flat near-black, which scores 17.6:1 and passes
    every readability rule while looking nothing like their navy. The result
    read as a broken black band. So warn on a colour with almost no hue,
    where the three channels sit within a few points of each other: that is
    a neutral grey or black rather than a brand colour, and is far more often
    an eyedropper mistake than a deliberate choice.
  */
  if (colors.dark) {
    const ratio = contrastRatio(colors.dark, "#ffffff");
    if (ratio < 7) {
      return {
        error: `White text scores ${ratio.toFixed(1)}:1 on that dark colour. It needs 7:1, so choose something deeper.`,
      };
    }
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(colors.dark.slice(i, i + 2), 16),
    );
    if (Math.max(r, g, b) - Math.min(r, g, b) < 12) {
      warnings.push(
        "the dark colour is a flat neutral rather than a brand shade, so those sections will read as plain black",
      );
    }
  }

  const branding: Branding = {};
  if (companyName) branding.companyName = companyName;
  if (shortName) branding.shortName = shortName;
  if (supportEmail) branding.supportEmail = supportEmail;
  if (crmPartnerName) branding.crmPartnerName = crmPartnerName;
  if (legalName) branding.legalName = legalName;
  if (contactUrl) branding.contactUrl = contactUrl;
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
  /*
    crmPartnerName was missing here, so uploading or removing a logo wrote
    the branding back without it and silently dropped the partner's CRM
    attribution: every lead after that was credited to the display name.
  */
  if (parsed.crmPartnerName) out.crmPartnerName = parsed.crmPartnerName;
  if (parsed.legalName) out.legalName = parsed.legalName;
  if (parsed.contactUrl) out.contactUrl = parsed.contactUrl;
  if (parsed.colors) out.colors = parsed.colors;
  if (parsed.logo) out.logo = parsed.logo;
  return out;
}

const LOGO_BUCKET = "tenant-logos";

/**
 * Step one of a logo upload: a one-time link to put the file straight into
 * Storage.
 *
 * The file never passes through this server. Vercel refuses any function
 * request over 4.5MB and server actions refuse 1MB by default, so routing the
 * bytes through an action is what capped logo size. Uploading to a signed URL
 * goes browser to Storage directly, so there is no app-level size limit; the
 * only ceiling left is the Supabase project's global upload limit.
 *
 * The path is chosen here, not by the browser, and always sits inside the
 * partner's own folder. The link is valid for that one path only.
 */
export async function startPartnerLogoUpload(input: {
  tenantId: string;
  fileName: string;
}): Promise<{ error: string } | { ok: true; path: string; signedUrl: string }> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };

  // Keep the extension for a readable bucket listing; it decides nothing.
  const ext = /\.([a-z0-9]{1,8})$/i.exec(String(input.fileName ?? ""))?.[1]?.toLowerCase() ?? "img";
  const path = `${tenantId}/${Date.now()}.${ext}`;

  const { data, error } = await createAdminClient()
    .storage.from(LOGO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[partners] could not sign a logo upload", error?.message);
    return { error: "Could not start the upload. Try again shortly." };
  }
  return { ok: true, path, signedUrl: data.signedUrl };
}

/**
 * Step two: point the partner's branding at the file just uploaded.
 *
 * Width and height come from the browser, which read them by loading the
 * file as an image. They only reserve the header's space, parseBranding
 * clamps them again on read, and the caller is platform staff, so they are
 * checked for shape rather than re-measured.
 */
export async function savePartnerLogo(input: {
  tenantId: string;
  path: string;
  width: number;
  height: number;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };

  // Only a file in this partner's own folder, in the shape step one issues.
  const path = String(input.path ?? "");
  const name = path.slice(tenantId.length + 1);
  if (!path.startsWith(`${tenantId}/`) || !/^\d+\.[a-z0-9]{1,8}$/.test(name)) {
    return { error: "That upload is not valid. Choose the file again." };
  }
  const width = Math.round(Number(input.width));
  const height = Math.round(Number(input.height));
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= LOGO_MAX_DIMENSION;
  if (!inRange(width) || !inRange(height)) {
    return { error: "Could not read that image's size. Choose the file again." };
  }

  const admin = createAdminClient();
  const { data: found } = await admin.storage
    .from(LOGO_BUCKET)
    .list(tenantId, { search: name, limit: 1 });
  if (!found?.some((o) => o.name === name)) {
    return { error: "The upload did not finish. Choose the file again." };
  }

  const before = await currentBranding(tenantId);
  const branding: Branding = {
    ...before,
    logo: { path, width, height, displayHeight: 28 },
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

  // The replaced file is unreferenced now. Best-effort: an orphan costs
  // storage, a failed save would have cost the logo.
  if (before.logo && before.logo.path !== path) {
    await admin.storage.from(LOGO_BUCKET).remove([before.logo.path]);
  }

  invalidateTenants();
  return { ok: true, message: `Logo saved (${width} × ${height}).` };
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
 * Permanently deletes a test partner, or one that never went live.
 *
 * The rules live in the delete_partner RPC (0017), not here: suspended first,
 * never received a lead or a consent record, slug typed to confirm. This
 * layer only cleans up what SQL should not touch, and both cleanups run after
 * the delete has committed, so neither can leave a half-deleted tenant.
 *
 * Auth users go through the admin API, the supported path, which also ends
 * their sessions. If one fails the person still reaches nothing, because
 * their profile is gone and tenant_scope() reads profiles; it is logged so
 * the address can be freed by hand.
 */
export async function deletePartner(input: {
  tenantId: string;
  slug: string;
}): Promise<PartnerResult> {
  const guard = await guardStaff();
  if (!guard.ok) return { error: guard.error };

  const tenantId = String(input.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return { error: "That partner is not valid." };
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!slug) return { error: "Type the subdomain to confirm." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_partner", {
    p_tenant_id: tenantId,
    p_slug: slug,
  });
  if (error) return { error: rpcMessage(error.message, "Could not delete that partner.") };

  const result = (data ?? {}) as {
    name?: string;
    user_ids?: string[];
    logo_path?: string | null;
  };

  const admin = createAdminClient();
  const failed: string[] = [];
  for (const id of result.user_ids ?? []) {
    const { error: de } = await admin.auth.admin.deleteUser(id);
    if (de) {
      console.error("[partners] auth user left behind after partner delete", id, de.message);
      failed.push(id);
    }
  }
  if (result.logo_path) {
    await admin.storage.from(LOGO_BUCKET).remove([result.logo_path]);
  }

  invalidateTenants();
  const name = result.name ?? "The partner";
  return {
    ok: true,
    message: failed.length
      ? `${name} deleted, but ${failed.length} login${failed.length === 1 ? "" : "s"} could not be removed from sign-in. They have no access; the address may not be reusable yet.`
      : `${name} deleted.`,
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

  /*
    Revalidate AFTER inviteIntoTenant has waited for the profile row, never
    before: the row is written by a trigger on GoTrue's follow-up update, so
    re-rendering too early re-reads the member list without the new person in
    it. See waitForProfile().
  */
  invalidateTenants();
  // The inner call keeps its own message when the row did not land in time,
  // so the admin is told to refresh rather than shown a plain success.
  return { ok: true, message: sent.message ?? `Invite sent to ${email}.` };
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
    /*
      Key off the error CODE, not the message.

      AuthError carries a typed `code` (see @supabase/auth-js error-codes), and
      GoTrue returns `email_exists` or `user_already_exists` here. The message
      wording has changed across GoTrue versions ("User already registered" vs
      "A user with this email address has already been registered"), so
      matching on English prose means this silently stops resending the day the
      wording moves: every resend would fall through to the generic failure
      below. The substring test is kept only as a fallback for a version that
      sends no code at all.

      Not `status === 422`: validation_failed is also a 422, and treating a
      malformed address as "already registered" would mail a recovery link
      decision path for an account that does not exist.
    */
    const code = error?.code;
    const raw = (error?.message ?? "").toLowerCase();
    const alreadyExists =
      code === "email_exists" ||
      code === "user_already_exists" ||
      (!code &&
        (raw.includes("already registered") ||
          raw.includes("already been registered")));

    if (alreadyExists) {
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

  const listed = await waitForProfile(admin, linkData.user.id);

  return listed
    ? { ok: true }
    : {
        ok: true,
        message: `Invite sent to ${email}. Refresh to see them in the list.`,
      };
}

/**
 * Waits for the profile row the invite will produce.
 *
 * WHY THIS EXISTS
 *
 * GoTrue's invite is two statements, not one: it inserts the auth user, then
 * stamps invited_at in a follow-up update, measured at 48ms apart on the live
 * project (0008_invite_update_trigger.sql). Since 0007 the profile is only
 * created once invited_at is set, so for a moment after generateLink() returns
 * there is an auth user and no profile.
 *
 * The partners screen reads its member list from profiles. Revalidating in
 * that window re-renders the page from the database BEFORE the row lands, so
 * the admin sees a success toast and an unchanged list, which reads as "adding
 * users is broken". That is the defect this closes.
 *
 * Polls by primary key, so each attempt is an index hit, not a scan.
 *
 * Returns false rather than throwing when the row never appears. The invite
 * genuinely was sent and the row will exist moments later; failing here would
 * report a successful invite as an error, which is worse than asking for a
 * refresh. The caller says so in the toast.
 */
async function waitForProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  attempts = 10,
  intervalMs = 50,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
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
  /*
    Scoped to this tenant in the QUERY, and read as a list.

    It used to be a tenant-blind .maybeSingle(), which had two failure modes.
    profiles.email carries no unique index, so two tenants holding the same
    address (the same person invited to both, or an old house row beside a
    partner one) made PostgREST return 406 for "more than one row". The error
    was discarded, `profile` came back undefined, and a legitimate user was
    refused with "that address already has an account somewhere else": the one
    message that sends staff off to change an address that was never the
    problem.

    .eq, not .ilike: email reaches here straight from the form, and in a LIKE
    pattern `%` and `_` are wildcards, so `%@partner.com` would match an
    arbitrary other user on the tenant and mail THEM a working sign-in link.
    EMAIL_RE now rejects both characters as well; this is the second lock.

    Case: the address is lowercased at the entry point, but profiles stores
    auth.users.email verbatim, so a row predating that normalisation could be
    mixed case. Compared on lower(email) to stay correct either way.
  */
  const { data: rows, error: lookupError } = await admin
    .from("profiles")
    .select("id, tenant_id, deactivated_at, email")
    .eq("tenant_id", tenant.id)
    .ilike("email", escapeLike(email))
    .limit(2)
    .overrideTypes<
      { id: string; tenant_id: string; deactivated_at: string | null; email: string | null }[]
    >();

  if (lookupError) {
    console.error("[partners] resend lookup failed", lookupError);
    return { error: "Could not look that account up. Try again shortly." };
  }

  // Filtered server-side, so this is not a client-side scan with a silent cap:
  // limit(2) exists only to prove the match is unambiguous, never to page.
  const profile = (rows ?? [])[0];

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

  const supabase = await createClient();

  /*
    Through the RPC, not a service-role UPDATE.

    This was the one partner mutation with no database-level re-check of the
    caller, which made the file's opening claim of "enforced three times over"
    untrue for exactly this function. 0013 moves the house-tenant refusal, the
    both-ids pin and the new last-user guard into the database, where the count
    runs under lock_tenant_team() and a concurrent call cannot slip between the
    count and the update.

    The session client, so require_platform_staff() sees a real auth.uid().
  */
  const { data: who, error } = await supabase.rpc("set_partner_user_access", {
    p_tenant_id: tenantId,
    p_profile_id: profileId,
    p_active: active,
  });

  if (error) {
    /*
      PGRST202 means 0013 has not been applied to this project yet. Migrations
      here are run by hand in the Supabase SQL editor, so code and schema can
      deploy out of step, and a hard failure would take Remove and Restore down
      on a screen where they work today.

      So fall back to the pre-0013 service-role path, which keeps the feature
      working but WITHOUT the last-user guard. Logged loudly, because this is a
      degraded mode that should last only until the migration is applied.
    */
    if (error.code === "PGRST202") {
      console.error(
        "[partners] set_partner_user_access missing: apply migration 0013. " +
          "Falling back to the unguarded path.",
      );
      return legacySetPartnerUserActive({
        tenantId,
        profileId,
        active,
        actorId: guard.ctx.userId,
      });
    }

    // The RPC raises with a message written for this screen, so surface it
    // rather than a generic one: "that is the only person who can sign in to
    // Acme Brokers" tells the admin what to do next.
    return {
      error: rpcMessage(error.message, "Could not change that person's access."),
    };
  }

  const name = typeof who === "string" && who ? who : "That person";

  /*
    NO SESSION REVOCATION HERE, AND IT IS NOT AN OVERSIGHT.

    A removed user keeps a valid access token until it expires, which looks
    like a hole: it is a real Supabase JWT and PostgREST accepts it with the
    public anon key, so the concern is direct API reads, not page renders
    (getSessionContext already treats a deactivated profile as no session).

    But tenant_scope() (0009) filters `deactivated_at is null` in BOTH of its
    branches, so a deactivated profile resolves to an empty scope and every
    RLS policy denies the row. Verified against the live project by minting a
    real session for a partner user, reading their leads (1 row), deactivating
    the profile, and re-using the SAME session: 0 rows, no error.

    Adding auth.admin.signOut() would not help anyway: it takes a JWT, not a
    user id, and there is no user-id revocation in auth-js 2.112. The
    alternative, ban_duration via updateUserById, is an account-level action
    with its own reversal semantics, and it would be buying nothing here.
  */

  revalidatePath("/console/partners");
  return {
    ok: true,
    message: active ? `${name} can sign in again.` : `${name} no longer has access.`,
  };
}

/**
 * The pre-0013 path: a direct service-role UPDATE.
 *
 * Kept ONLY so Remove and Restore keep working on a project where migration
 * 0013 has not been applied yet. Delete this once 0013 is live everywhere.
 *
 * It carries the house-tenant refusal and the both-ids pin, which were always
 * here, but it CANNOT carry the last-user guard: counting active users and
 * then updating is a race in application code, which is the whole reason the
 * guard belongs in the database under lock_tenant_team(). See 0006 section 2
 * for the same argument about the house team.
 */
async function legacySetPartnerUserActive(input: {
  tenantId: string;
  profileId: string;
  active: boolean;
  actorId: string;
}): Promise<PartnerResult> {
  const { tenantId, profileId, active, actorId } = input;
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("tenants")
    .select("is_house")
    .eq("id", tenantId)
    .maybeSingle<{ is_house: boolean | null }>();
  if (!target) return { error: "That partner no longer exists." };
  if (target.is_house) {
    return { error: "Manage your own team from the Team screen." };
  }

  const { data, error } = await admin
    .from("profiles")
    .update({
      deactivated_at: active ? null : new Date().toISOString(),
      deactivated_by: active ? null : actorId,
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
    // 0017's refusals each say why and what to do instead.
    "cannot delete",
    "cannot be deleted",
    "does not match",
    "before deleting",
    "company name",
    "Unknown branding key",
    // 0013's guards. "only person who can sign in" names the partner and says
    // what to do next, so it must reach the admin rather than be swallowed.
    "only person who can sign in",
    "not on this partner",
    "Team screen",
  ];
  if (known.some((k) => raw.toLowerCase().includes(k.toLowerCase()))) return raw;
  console.error("[partners] rpc failed", raw);
  return fallback;
}
