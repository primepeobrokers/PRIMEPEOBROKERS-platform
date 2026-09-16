import type { Branding } from "@/lib/tenant/branding";
import { logoUrl } from "@/lib/tenant/branding";
import { houseOrigin, tenantOrigin } from "@/lib/tenant/urls";

/**
 * Who an email appears to come from.
 *
 * Every message leaves through ONE verified Resend sender (the address in
 * EMAIL_FROM), because Resend will not send from a domain it has not
 * verified and per-partner verification would make onboarding a DNS project.
 * What changes per tenant is everything a recipient actually reads: the
 * display name, the header mark, the button colour, the links, and where a
 * reply lands. That is the white-label the client asked for, achieved
 * without the partner touching their own DNS.
 *
 * Values here are trusted by lib/email.ts and interpolated into inline
 * styles and attributes. They are safe because they come from parseBranding
 * (hex allowlist for colours, bucket-path allowlist for the logo, length caps
 * on text), and the name is HTML-escaped at render. Do not build an
 * EmailBrand from a raw tenants.branding row.
 *
 * No "server-only" marker, so the unit suite can import the pure helpers.
 * Nothing here is secret: the only env read is the team inbox address.
 */
export interface EmailBrand {
  /** Display name: the From line, the header wordmark, and subject lines. */
  name: string;
  /** Absolute origin every link is built on. A partner's own subdomain. */
  origin: string;
  isHouse: boolean;
  /** Header mark. Intrinsic size so the height-30 render can set a width. */
  logo?: { url: string; width: number; height: number };
  /** Where a reply to a lead-facing message lands. */
  replyTo?: string;
  /** Validated hex, or undefined for the house token. */
  accent?: string;
  ink?: string;
}

export const HOUSE_NAME = "Prime PEO Brokers";

/** The minimum a tenant has to carry to be branded. Matches ResolvedTenant. */
export interface BrandSource {
  slug: string;
  name: string;
  branding: Branding;
  isHouse: boolean;
}

/**
 * The house brand.
 *
 * Reply-to is the team inbox when one is configured: the confirmation email
 * invites the lead to "reply to this email", and without this a reply would
 * go to the bare notifications sender.
 */
export function houseBrand(): EmailBrand {
  const origin = houseOrigin();
  // One reply-to address: the first inbox in the list. Resend rejects a
  // comma-joined string in reply_to with a 422, which is how every visitor
  // email silently failed in production when the team set two inboxes.
  const [inbox] = inboxList();
  return {
    name: HOUSE_NAME,
    origin,
    isHouse: true,
    logo: { url: `${origin}/brand/email-mark.png`, width: 30, height: 30 },
    replyTo: inbox,
  };
}

/**
 * The team inboxes from LEAD_NOTIFY_EMAIL, which may list several addresses
 * separated by commas, semicolons, or whitespace. Anything without an "@" is
 * dropped. Always pass the result to Resend as an array, never re-joined:
 * a single string with a comma in it is an invalid address to them.
 */
export function inboxList(raw = process.env.LEAD_NOTIFY_EMAIL): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * The brand for a tenant. A missing tenant (unknown host, lookup failure)
 * degrades to the house brand, the same way currentTenantIdForWrite falls
 * back to the house tenant: a lead on an unrecognised host still gets an
 * email rather than nothing.
 */
export function brandFor(tenant: BrandSource | null | undefined): EmailBrand {
  if (!tenant || tenant.isHouse) return houseBrand();

  const b = tenant.branding;
  return {
    name: b.companyName ?? tenant.name,
    origin: tenantOrigin(tenant.slug, false),
    isHouse: false,
    logo: b.logo
      ? { url: logoUrl(b.logo.path), width: b.logo.width, height: b.logo.height }
      : undefined,
    replyTo: b.supportEmail,
    accent: b.colors?.accent,
    ink: b.colors?.ink,
  };
}

/** A parsed EMAIL_FROM. */
export interface Sender {
  name: string;
  address: string;
}

/**
 * Splits "Name <addr>" or a bare "addr". A missing or malformed value falls
 * back to Resend's onboarding sender, which delivers only to the account
 * owner: loud in development, harmless in production where EMAIL_FROM is set.
 */
export function parseSender(raw: string | undefined): Sender {
  const value = (raw ?? "").trim() || `${HOUSE_NAME} <onboarding@resend.dev>`;
  const m = value.match(/^"?([^"<>]*?)"?\s*<([^<>\s]+)>$/);
  if (m) {
    const name = m[1]!.trim();
    return { name: name || HOUSE_NAME, address: m[2]! };
  }
  return { name: HOUSE_NAME, address: value };
}

/**
 * The From header for a brand: the brand's display name on the ONE verified
 * address. Quotes, angle brackets and line breaks are stripped from the name
 * so a stray character in a partner's company name cannot break out of the
 * quoted display-name and have Resend reject every email their leads should
 * get. Hygiene, not a security boundary: staff type the name in.
 */
export function formatFrom(name: string, sender: Sender): string {
  const clean = name.replace(/["<>\r\n]+/g, " ").replace(/\s+/g, " ").trim() || sender.name;
  return `"${clean}" <${sender.address}>`;
}
