/**
 * The shape of public.tenants.branding, and the parsing that makes it safe to
 * put on a page.
 *
 * No "server-only" marker: the parsed Branding object is rendered by client
 * components (a partner wordmark in a header), so this module has to be
 * client-bundleable. It reads no environment and touches no database.
 *
 * Every field is optional and every invalid value falls back to the house
 * token in app/globals.css. That is what makes the branding form safe to hand
 * to a non-developer: the worst outcome of a bad value is "the default
 * colour", never a broken page.
 */

export interface BrandingLogo {
  /** Path inside the `tenant-logos` Storage bucket, not a URL. */
  path: string;
  /** Intrinsic size, so next/image can reserve space and avoid layout shift. */
  width: number;
  height: number;
  /** Rendered height in the portal header. Clamped to 16..48. */
  displayHeight?: number;
  alt?: string;
}

export interface BrandingColors {
  accent?: string;
  accentPress?: string;
  ink?: string;
  dark?: string;
  darkRaised?: string;
}

export interface Branding {
  /** Display name. Replaces the hardcoded "Prime PEO Brokers" strings. */
  companyName?: string;
  /** Short form for tight spots: email header, mobile nav. */
  shortName?: string;
  logo?: BrandingLogo;
  colors?: BrandingColors;
  /** Reply-to / footer address on partner-facing email. */
  supportEmail?: string;
  /** The partner's name as the CRM knows it, which is not always our own. */
  crmPartnerName?: string;
  /**
   * The partner's registered legal name, for the footer disclosure ("[name]
   * is a referral partner"). Falls back to the display name when unset.
   */
  legalName?: string;
  /**
   * Where "Contact" and "Talk to an advisor" go on this partner's pages: an
   * https URL or an email address. Falls back to supportEmail when unset.
   */
  contactUrl?: string;
}

/**
 * #rgb, #rrggbb or #rrggbbaa. Nothing else.
 *
 * THIS REGEX IS THE SECURITY BOUNDARY OF THIS FILE.
 *
 * These values are interpolated into `<style>{":root{...}"}</style>`. React
 * escapes `<` inside a style child but does NOT escape `}` or `;`, because
 * the content of a <style> element is CSS, not HTML. So an unvalidated string
 * is CSS injection:
 *
 *   "red}body{display:none}"                  -> closes the rule, opens another
 *   "red;background-image:url(https://evil/)" -> exfiltrates on paint
 *
 * The allowlist admits no braces, semicolons, parentheses, whitespace, or
 * anything else that could terminate a declaration. Do not relax it to accept
 * rgb(), oklch(), or a bare CSS variable without re-deriving this argument
 * first: every one of those forms contains characters that make the injection
 * above reachable again.
 */
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function safeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return HEX_RE.test(v) ? v.toLowerCase() : undefined;
}

/** Trimmed, length-capped text. Undefined for anything empty or not a string. */
function safeText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > max) return undefined;
  return v;
}

/** A finite positive integer within bounds, else undefined. */
function safeInt(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  return i >= min && i <= max ? i : undefined;
}

/**
 * A Storage object path. Deliberately strict: no scheme, no host, no `..`, no
 * leading slash. The caller turns it into a URL against a known bucket, so
 * allowing an absolute URL here would let a branding row point the portal's
 * logo at an arbitrary third-party origin.
 */
function safePath(value: unknown): string | undefined {
  const v = safeText(value, 400);
  if (!v) return undefined;
  if (v.startsWith("/") || v.includes("..") || v.includes("://")) return undefined;
  return /^[a-zA-Z0-9._\-/]+$/.test(v) ? v : undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * A partner contact: an https URL or an email address, nothing else.
 *
 * This value is rendered as an href on a public page, so it is the other
 * injection boundary in this file. `javascript:` and `data:` are the obvious
 * payloads; plain http is refused too, since a contact link that downgrades
 * the visitor off an https page is not one we should publish.
 */
function safeContact(value: unknown): string | undefined {
  const v = safeText(value, 400);
  if (!v) return undefined;
  if (EMAIL_RE.test(v) && !v.includes(":") && !v.includes("/")) return v;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && url.hostname ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** mailto: for an address, the URL itself otherwise. Input must have passed safeContact. */
export function contactHref(contact: string): string {
  return EMAIL_RE.test(contact) && !contact.includes("/")
    ? `mailto:${contact}`
    : contact;
}

/**
 * Coerces whatever is in the jsonb column into a Branding.
 *
 * Coercion with fallback, never throw. A thrown error here would 500 a
 * partner's entire portal over one bad colour, so each field independently
 * degrades to undefined and the caller falls back to the house token. Same
 * approach as sanitizeAnswers in lib/discovery/schema.ts and the page
 * clamping in lib/console/query.ts.
 *
 * `tenantName` is the fallback for companyName, so a tenant that has never
 * been branded still renders its own name rather than the house brand.
 */
export function parseBranding(raw: unknown, tenantName: string): Branding {
  const out: Branding = {};

  // A jsonb array or scalar is not a shape we can read. Degrade to defaults
  // rather than indexing into it. (The DB also constrains this to an object
  // as of 0009, but this function must not assume the migration ran.)
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  out.companyName = safeText(src.companyName, 120) ?? tenantName;
  out.shortName = safeText(src.shortName, 40);

  const email = safeText(src.supportEmail, 200);
  if (email && EMAIL_RE.test(email)) out.supportEmail = email;

  out.crmPartnerName = safeText(src.crmPartnerName, 120);
  out.legalName = safeText(src.legalName, 200);
  out.contactUrl = safeContact(src.contactUrl);

  const logo =
    src.logo && typeof src.logo === "object" && !Array.isArray(src.logo)
      ? (src.logo as Record<string, unknown>)
      : null;
  if (logo) {
    const path = safePath(logo.path);
    const width = safeInt(logo.width, 1, 4000);
    const height = safeInt(logo.height, 1, 4000);
    // All three or none: next/image needs the intrinsic size to reserve
    // space, and a logo without it would shift the header on load.
    if (path && width && height) {
      out.logo = {
        path,
        width,
        height,
        displayHeight: safeInt(logo.displayHeight, 16, 48),
        alt: safeText(logo.alt, 200),
      };
    }
  }

  const colors =
    src.colors && typeof src.colors === "object" && !Array.isArray(src.colors)
      ? (src.colors as Record<string, unknown>)
      : null;
  if (colors) {
    const c: BrandingColors = {
      accent: safeColor(colors.accent),
      accentPress: safeColor(colors.accentPress),
      ink: safeColor(colors.ink),
      dark: safeColor(colors.dark),
      darkRaised: safeColor(colors.darkRaised),
    };
    // Only attach if at least one survived, so `colors: {}` does not imply a
    // theme override downstream.
    if (Object.values(c).some(Boolean)) out.colors = c;
  }

  return out;
}

/**
 * Turns a Branding into the body of a `:root { ... }` rule.
 *
 * Only the keys the tenant actually set are emitted, so an unset colour keeps
 * its house value from globals.css rather than resolving to an empty string.
 * Returns "" when there is nothing to override, and the caller then renders
 * no <style> at all.
 *
 * This works without touching any Tailwind config because every entry in the
 * `@theme inline` block in app/globals.css is var()-indirected: Tailwind emits
 * `var(--pv-accent)` into `.bg-accent` rather than the literal hex, so
 * overriding the --pv-* layer retints every utility in the app. Removing
 * `inline` from that block would silently break per-tenant theming.
 *
 * The greys and pressed states are DERIVED with color-mix rather than exposed
 * as separate fields. The brand guide builds them by mixing navy into white
 * (see the globals.css header), so letting a partner set them independently
 * would break the family relationship and produce muddy, mismatched text. It
 * also means the branding form needs five colour pickers rather than thirty.
 */
export function brandingToCss(branding: Branding): string {
  const c = branding.colors;
  if (!c) return "";

  const out: string[] = [];

  if (c.accent) {
    out.push(`--pv-accent:${c.accent}`);
    out.push(
      `--pv-accent-press:${c.accentPress ?? `color-mix(in oklab,${c.accent} 84%,black)`}`,
    );
  }

  if (c.ink) {
    out.push(`--pv-ink:${c.ink}`);
    out.push(`--pv-ink-soft:color-mix(in oklab,${c.ink} 80%,white)`);
    out.push(`--pv-ink-muted:color-mix(in oklab,${c.ink} 62%,white)`);
    out.push(`--pv-ink-faint:color-mix(in oklab,${c.ink} 50%,white)`);
  }

  if (c.dark) {
    out.push(`--pv-dark:${c.dark}`);
    out.push(
      `--pv-dark-raised:${c.darkRaised ?? `color-mix(in oklab,${c.dark} 92%,white)`}`,
    );
    out.push(`--pv-dark-line:color-mix(in oklab,${c.dark} 78%,white)`);
    out.push(`--pv-dark-line-soft:color-mix(in oklab,${c.dark} 86%,white)`);
  }

  return out.join(";");
}

/** Relative luminance, WCAG 2.x. Input must already have passed HEX_RE. */
function luminance(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}

/**
 * Contrast ratio between two hex colours, 1..21.
 *
 * The branding form needs this because a partner picking a pale accent
 * produces a portal that fails WCAG AA everywhere the accent carries a label.
 * The house orange is itself only 3.73:1 on white, which is why globals.css
 * restricts it to large text, bold button labels and the mark; a partner
 * should be held to at least that.
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Public URL for a branding logo.
 *
 * branding.logo.path is a path inside the `tenant-logos` bucket, never a URL:
 * safePath rejects a scheme and a host precisely so a branding row cannot
 * point a partner's header at a third-party origin. This is the one place
 * that turns it into something an <img src> can load.
 */
export function logoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/tenant-logos/${path}`;
}

/** Exported for the check script, which asserts the injection cases directly. */
export const __testables = { safeColor, safePath, safeText, safeInt, safeContact };
