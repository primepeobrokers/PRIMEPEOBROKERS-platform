import type { Branding } from "@/lib/tenant/branding";
import type { Answers } from "@/lib/discovery/schema";

/**
 * What changes when a page is served on a partner's subdomain, beyond the
 * logo and palette.
 *
 * The client's November 2026 template (after All Staff's feedback): the
 * partner's site introduces the work once, in the homepage hero, as "your
 * [partner] team, with evaluation by Prime PEO Brokers", and from then on
 * speaks as "your advisor" and "our advisory team". Prime stays named where
 * the sentence is a factual claim (a Prime placement, Prime's agreements
 * across the market) or about licensing, and in the footer, the legal pages
 * and the consent wording, which are not run through this.
 *
 * This reverses the October rule, which rewrote "your advisor" to "your Prime
 * advisor" on every partner page.
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
 * Prime advisor" is rewritten before "your Prime advisor" could match inside
 * it, and the whole "we hold agreements ... and quote" clause before its
 * first half: the verb after "and" has to agree with "Prime" once "we" is
 * gone, or the partner's page reads "Prime holds agreements ... and quote".
 *
 * "A licensed Prime advisor" is deliberately not matched: it is a licensing
 * statement, and those keep Prime's name.
 */
const VOICE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b([Yy])our assigned Prime advisor\b/g, "$1our assigned advisor"],
  [/\b([Yy])our Prime advisor\b/g, "$1our advisor"],
  [/\bPrime[’']s advisory team\b/g, "our advisory team"],
  [/\bOur team\b/g, "Our advisory team"],
  [/\bour team\b/g, "our advisory team"],
  [/\b[Ww]e hold agreements across the market and quote\b/g, "Prime holds agreements across the market and quotes"],
  [/\b[Ww]e hold agreements\b/g, "Prime holds agreements"],
];

/** Rewrites house copy into the partner-site voice. Idempotent. */
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

/** The name in the partner's header and browser tab, or null on the house site. */
export function partnerDisplayName(tenant: PartnerTenant): string | null {
  if (!isPartnerTenant(tenant)) return null;
  return tenant.branding.companyName ?? tenant.name;
}

/**
 * The partner's public contact address, or null when they have none.
 *
 * Their contact email, then their work email (supportEmail), which was where
 * these links went before contactEmail existed, so a partner configured
 * before November 2026 does not change behaviour overnight.
 */
export function partnerContactEmail(tenant: PartnerTenant): string | null {
  if (!isPartnerTenant(tenant)) return null;
  return tenant.branding.contactEmail ?? tenant.branding.supportEmail ?? null;
}

export interface PartnerContact {
  href: string;
  label: string;
}

/**
 * Where "Contact", "Talk to an advisor" and the FAQ's "Anything else" line go.
 *
 * The partner's contact address on their site, else Prime's inbox, so a
 * partner who has not been fully configured still gets a working link rather
 * than a dead one (client decision, 4 Nov 2026). On the house site: Prime's
 * inbox.
 *
 * Privacy, terms, deletion requests, "Do not sell my data", legal notices,
 * compensation questions and withdrawing call consent are deliberately NOT
 * routed through this. They always reach Prime.
 */
export function partnerContact(tenant: PartnerTenant): PartnerContact {
  const email = partnerContactEmail(tenant) ?? HOUSE_EMAIL;
  return { href: `mailto:${email}`, label: email };
}

/**
 * The example address in the sign-in email field: "you@" and the partner's
 * email domain (you@allstaffco.com), so their staff see their own domain
 * rather than Prime's. A partner with no address gets a neutral example.
 */
export function signInPlaceholder(tenant: PartnerTenant): string {
  if (!isPartnerTenant(tenant)) return "you@primepeobrokers.com";
  const domain = partnerContactEmail(tenant)?.split("@")[1];
  return `you@${domain ?? "company.com"}`;
}

/** The partner named in the footer, or null on the house site. */
export function partnerLegalName(tenant: PartnerTenant): string | null {
  if (!isPartnerTenant(tenant)) return null;
  return tenant.branding.legalName ?? tenant.branding.companyName ?? tenant.name;
}

/** Everything the footer says about a partner. null on the house site. */
export interface PartnerFooter {
  /** "All Staff, Inc.": "Presented by", and who holds the name and logo. */
  legalName: string;
  /** "All Staff": whose name and logo the copyright line is about. */
  displayName: string;
  /** Each shown only when set, in this order. */
  phone: string | null;
  email: string | null;
  address: string | null;
}

export function partnerFooter(tenant: PartnerTenant): PartnerFooter | null {
  if (!isPartnerTenant(tenant)) return null;
  return {
    legalName: partnerLegalName(tenant) ?? tenant.name,
    displayName: partnerDisplayName(tenant) ?? tenant.name,
    phone: tenant.branding.phone ?? null,
    email: partnerContactEmail(tenant),
    address: tenant.branding.mailingAddress ?? null,
  };
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
  return partnerDisplayName(tenant);
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
