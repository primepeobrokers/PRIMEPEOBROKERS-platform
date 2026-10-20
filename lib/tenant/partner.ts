import { contactHref, type Branding } from "@/lib/tenant/branding";
import type { Answers } from "@/lib/discovery/schema";

/**
 * What changes when a page is served on a partner's subdomain, beyond the
 * logo and palette.
 *
 * Counsel's position (October 2026): on a partner's site, the visitor must be
 * able to tell that Prime, not the partner, provides the Services. So the
 * first-person copy written for Prime's own site ("our team", "your advisor",
 * "we hold agreements") is rewritten to name Prime, because on a partner's
 * page "our" reads as the partner.
 *
 * Pure and client-bundleable: the discovery flow is a client component and
 * the unit suite imports this directly.
 */

/** The minimum a page knows about its tenant. null means the house site. */
export type PartnerTenant = {
  isHouse: boolean;
  name: string;
  branding: Branding;
} | null;

export const HOUSE_NAME = "Prime PEO Brokers";
export const HOUSE_EMAIL = "admin@primepeobrokers.com";

/**
 * Phrase -> partner-tenant phrase. Ordered longest first, so "your assigned
 * advisor" is rewritten before "your advisor" could match inside it, and the
 * whole "we hold agreements ... and quote" clause before its first half: the
 * verb after "and" has to agree with "Prime" once "we" is gone, or the
 * partner's page reads "Prime holds agreements ... and quote your record".
 */
const VOICE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bYour assigned advisor\b/g, "Your assigned Prime advisor"],
  [/\byour assigned advisor\b/g, "your assigned Prime advisor"],
  [/\bYour advisor\b/g, "Your Prime advisor"],
  [/\byour advisor\b/g, "your Prime advisor"],
  [/\bOur team\b/g, "Prime’s advisory team"],
  [/\bour team\b/g, "Prime’s advisory team"],
  [/\b[Ww]e hold agreements across the market and quote\b/g, "Prime holds agreements across the market and quotes"],
  [/\bWe hold agreements\b/g, "Prime holds agreements"],
  [/\bwe hold agreements\b/g, "Prime holds agreements"],
];

/** Rewrites first-person copy so it names Prime. Idempotent. */
export function partnerVoice(text: string): string {
  let out = text;
  for (const [re, to] of VOICE) out = out.replace(re, to);
  return out;
}

export function isPartnerTenant(
  tenant: PartnerTenant,
): tenant is NonNullable<PartnerTenant> & { isHouse: false } {
  return tenant !== null && !tenant.isHouse;
}

/** The copy function a page should run its strings through. Identity on the house site. */
export function voiceFor(tenant: PartnerTenant): (text: string) => string {
  return isPartnerTenant(tenant) ? partnerVoice : (t) => t;
}

export interface PartnerContact {
  href: string;
  /** What to print when the link is shown as text: the address, or the partner's name for a URL. */
  label: string;
  isEmail: boolean;
}

/**
 * Where "Contact", "Talk to an advisor" and the FAQ's "Anything else" line go.
 *
 * On a partner tenant: their contact setting, then their work email, then
 * Prime's inbox, so a partner who has not been fully configured still gets a
 * working link rather than a dead one. On the house site: Prime's inbox.
 *
 * Privacy, terms, deletion requests, compensation questions and withdrawing
 * call consent are deliberately NOT routed through this. They always reach
 * Prime.
 */
export function partnerContact(tenant: PartnerTenant): PartnerContact {
  if (isPartnerTenant(tenant)) {
    const { contactUrl, supportEmail, companyName } = tenant.branding;
    if (contactUrl) {
      const href = contactHref(contactUrl);
      const isEmail = href.startsWith("mailto:");
      return {
        href,
        label: isEmail ? contactUrl : (companyName ?? tenant.name),
        isEmail,
      };
    }
    if (supportEmail) {
      return { href: `mailto:${supportEmail}`, label: supportEmail, isEmail: true };
    }
  }
  return { href: `mailto:${HOUSE_EMAIL}`, label: HOUSE_EMAIL, isEmail: true };
}

/** The partner named in the footer disclosure, or null on the house site. */
export function partnerLegalName(tenant: PartnerTenant): string | null {
  if (!isPartnerTenant(tenant)) return null;
  return tenant.branding.legalName ?? tenant.branding.companyName ?? tenant.name;
}

/**
 * The referrer a partner tenant's lead is credited to, or null on the house
 * site.
 *
 * Step 6 asks "Referred by an advisor, broker, or partner?". On a partner's
 * site the answer is already known: it is the partner whose site this is. So
 * the field is filled with their display name and locked (client decision,
 * 20 Oct 2026). The display name rather than the legal name, because it is
 * the name the visitor just saw in the header.
 */
export function partnerReferrer(tenant: PartnerTenant): string | null {
  if (!isPartnerTenant(tenant)) return null;
  return tenant.branding.companyName ?? tenant.name;
}

/**
 * The answers with step 6's referrer set from the tenant, whatever was typed.
 *
 * Applied by the flow so the locked field shows the name, and again by the
 * server actions, which are the boundary: a hand-built request, or a draft
 * saved before the field was locked, cannot credit a partner's lead to
 * anyone else. Identity on the house site, where the field is free text.
 */
export function withPartnerReferral(answers: Answers, tenant: PartnerTenant): Answers {
  const referrer = partnerReferrer(tenant);
  return referrer === null ? answers : { ...answers, referredBy: referrer };
}
