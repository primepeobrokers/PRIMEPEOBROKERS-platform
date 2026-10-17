import { contactHref, type Branding } from "@/lib/tenant/branding";

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
 * advisor" is rewritten before "your advisor" could match inside it.
 *
 * "your broker's team" is not in counsel's list, but it is the same claim in
 * different words, and on a partner's site it would tell the visitor their
 * sensitive payroll data is visible to the partner. The amended privacy
 * policy says the opposite.
 */
const VOICE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bYour assigned advisor\b/g, "Your assigned Prime advisor"],
  [/\byour assigned advisor\b/g, "your assigned Prime advisor"],
  [/\bYour advisor\b/g, "Your Prime advisor"],
  [/\byour advisor\b/g, "your Prime advisor"],
  [/\byour broker(?:'|&rsquo;|’)s team\b/g, "Prime’s advisory team"],
  [/\bOur team\b/g, "Prime’s advisory team"],
  [/\bour team\b/g, "Prime’s advisory team"],
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
 * Privacy, terms, deletion requests, compensation questions and STOP/HELP are
 * deliberately NOT routed through this. They always reach Prime.
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
