/**
 * Phase 3 tenant resolution and branding, checked without a database.
 *
 * Two things here are worth more than they look:
 *
 *   1. classifyHost decides which tenant's leads a request may see. A host it
 *      misreads as "apex" shows Prime PEO's own book to whoever asked, and a
 *      preview URL it misreads as a partner slug 404s every deploy preview.
 *      Neither failure is visible in a passing build.
 *
 *   2. safeColor is a CSS-injection boundary, not a validator. Its output is
 *      interpolated into `<style>{":root{...}"}</style>`, where React escapes
 *      `<` but not `}` or `;` because the content is CSS rather than HTML. If
 *      it ever admits a brace or a semicolon, a branding row becomes script
 *      -adjacent page control. Every case below is a real payload.
 */
import { readFileSync } from "node:fs";
import { classifyHost, APEX_HOST } from "../lib/tenant/host";
import {
  brandingToCss,
  contrastRatio,
  parseBranding,
  __testables,
} from "../lib/tenant/branding";

const { safeColor, safePath } = __testables;

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

// ---------------------------------------------------------------------------
// 1. Host classification
//
// APEX_HOST defaults to localhost:3000, which is what these cases assume.
// ---------------------------------------------------------------------------
const apex = APEX_HOST.split(":")[0]!;

const apexCases = [
  apex,
  `${apex}:3000`,
  `www.${apex}`,
  `WWW.${apex.toUpperCase()}`,
  // Vercel-assigned hosts serve the house site. Without this a preview URL
  // would be read as a request for the tenant "prime-vintage-git-main-abc".
  "prime-vintage.vercel.app",
  "prime-vintage-git-main-abc123.vercel.app",
  // Reserved labels are infrastructure, never a partner.
  `api.${apex}`,
  `admin.${apex}`,
  `console.${apex}`,
  `portal.${apex}`,
  `assets.${apex}`,
  `staging.${apex}`,
];
for (const h of apexCases) {
  ok(classifyHost(h).kind === "apex", `"${h}" should classify as apex`);
}

const partnerCases: [string, string][] = [
  [`acme.${apex}`, "acme"],
  [`acme.${apex}:3000`, "acme"],
  [`ACME.${apex}`, "acme"],
  [`  acme.${apex}  `, "acme"],
  [`a-b-c.${apex}`, "a-b-c"],
  [`p1.${apex}`, "p1"],
  [`${"a".repeat(63)}.${apex}`, "a".repeat(63)],
];
for (const [h, slug] of partnerCases) {
  const r = classifyHost(h);
  ok(r.kind === "partner" && r.slug === slug,
     `"${h}" should be partner "${slug}", got ${JSON.stringify(r)}`);
}

const unknownCases = [
  null,
  undefined,
  "",
  "   ",
  ":3000",
  // A host this deployment does not serve must NOT fall back to the house
  // tenant: a spoofed or typo'd Host would otherwise leak Prime PEO's leads.
  "evil.com",
  `acme.${apex}.evil.com`,
  // Two labels deep. A wildcard TLS cert does not cover it either.
  `a.b.${apex}`,
  // Fails the DB's own slug constraint, so no tenant could hold it.
  `x.${apex}`,
  `${"a".repeat(64)}.${apex}`,
  `under_score.${apex}`,
  `Ünicode.${apex}`,
  `-.${apex}`,
];
for (const h of unknownCases) {
  ok(classifyHost(h as string).kind === "unknown",
     `${JSON.stringify(h)} should classify as unknown`);
}

// The parser's slug rule must stay in step with the DB constraint, or a host
// can parse to a slug no tenant row could ever hold.
const initSql = readFileSync("supabase/migrations/0001_init.sql", "utf8");
ok(initSql.includes("[a-z0-9-]{2,63}"),
   "the tenants.slug constraint in 0001 no longer matches SLUG_RE in lib/tenant/host.ts");

// ---------------------------------------------------------------------------
// 2. safeColor: the CSS-injection boundary
// ---------------------------------------------------------------------------
for (const good of ["#fff", "#FFF", "#ff2d00", "#FF2D00", "#19233bff", " #fff "]) {
  ok(safeColor(good) !== undefined, `safeColor should accept ${JSON.stringify(good)}`);
}
ok(safeColor("#FF2D00") === "#ff2d00", "safeColor should lower-case its output");

// Each of these is a working payload if the regex is ever relaxed.
const payloads = [
  "red}body{display:none}",
  "#fff}html{opacity:0}",
  "red;background-image:url(https://evil.example/?c=1)",
  "#fff;position:fixed",
  "url(https://evil.example)",
  "rgb(255,0,0)",
  "oklch(0.7 0.1 20)",
  "var(--pv-ink)",
  "expression(alert(1))",
  "#fff/**/;x:y",
  "#ff2d00 ",           // trailing space is trimmed, so this one is fine
  "#gggggg",
  "#ff",
  "#ff2d0",
  "fff",
  "",
  "   ",
  "transparent",
  "currentColor",
  "inherit",
  null,
  undefined,
  123,
  {},
  [],
];
for (const p of payloads) {
  // "#ff2d00 " trims to a valid colour; everything else must be rejected.
  const expectAccept = typeof p === "string" && p.trim() === "#ff2d00";
  const got = safeColor(p);
  ok(expectAccept ? got === "#ff2d00" : got === undefined,
     `safeColor(${JSON.stringify(p)}) should ${expectAccept ? "accept" : "reject"}, got ${JSON.stringify(got)}`);
}

// Whatever brandingToCss emits must contain no character that could terminate
// a declaration and open a new one. This is the property that matters, tested
// independently of the regex above.
const hostile = parseBranding(
  {
    companyName: "Acme",
    colors: {
      accent: "red}body{display:none}",
      ink: "#123456",
      dark: "url(https://evil.example)",
    },
  },
  "Fallback",
);
const hostileCss = brandingToCss(hostile);

// Output is a `;`-separated declaration list by design, so the property to
// assert is not "no semicolons" but that every declaration is one of ours and
// every value is a hex or a color-mix over a hex. Nothing hostile survives.
ok(!hostileCss.includes("}"), "brandingToCss emitted a closing brace");
ok(!hostileCss.includes("url("), "brandingToCss emitted a url(");
ok(!hostileCss.includes("red"), "a rejected accent still reached the CSS");
ok(!hostileCss.includes("evil"), "a rejected dark colour still reached the CSS");
ok(hostileCss.includes("--pv-ink:#123456"), "a valid ink colour was dropped");
for (const decl of hostileCss.split(";")) {
  ok(/^--pv-[a-z-]+:(#[0-9a-f]{3,8}|color-mix\(in oklab,#[0-9a-f]{3,8} \d+%,(white|black)\))$/
      .test(decl),
     `brandingToCss emitted a declaration that is not a safe --pv-* value: ${JSON.stringify(decl)}`);
}

// ---------------------------------------------------------------------------
// 3. parseBranding degrades instead of throwing
// ---------------------------------------------------------------------------
for (const raw of [null, undefined, [], 42, "nope", true, {}]) {
  let threw = false;
  let name = "";
  try {
    name = parseBranding(raw, "House Co").companyName ?? "";
  } catch {
    threw = true;
  }
  ok(!threw, `parseBranding(${JSON.stringify(raw)}) threw instead of degrading`);
  ok(name === "House Co",
     `parseBranding(${JSON.stringify(raw)}) should fall back to the tenant name`);
}

// An unbranded tenant renders its own name, never the house brand.
ok(parseBranding({}, "Acme Brokers").companyName === "Acme Brokers",
   "an empty branding object should fall back to the tenant name");
ok(brandingToCss(parseBranding({}, "Acme")) === "",
   "an unbranded tenant should emit no CSS at all");
ok(brandingToCss(parseBranding({ colors: {} }, "Acme")) === "",
   "colors:{} should emit no CSS");

// A logo needs all three of path/width/height, or next/image cannot reserve
// space and the header shifts on load.
ok(parseBranding({ logo: { path: "a/b.png" } }, "Acme").logo === undefined,
   "a logo without intrinsic dimensions should be dropped");
ok(parseBranding({ logo: { path: "a/b.png", width: 200, height: 40 } }, "Acme").logo?.path
     === "a/b.png",
   "a complete logo should survive");

// A branding row must not be able to point the logo at a third-party origin.
for (const bad of [
  "https://evil.example/logo.png",
  "//evil.example/logo.png",
  "/etc/passwd",
  "../../secret.png",
  "a/../../b.png",
]) {
  ok(safePath(bad) === undefined, `safePath should reject ${JSON.stringify(bad)}`);
}
ok(safePath("tenants/acme/logo.png") === "tenants/acme/logo.png",
   "safePath should accept a plain bucket path");

// ---------------------------------------------------------------------------
// 4. Contrast, used by the branding form to refuse unreadable palettes
// ---------------------------------------------------------------------------
ok(Math.round(contrastRatio("#ffffff", "#000000")) === 21,
   "black on white should be 21:1");
ok(contrastRatio("#ffffff", "#ffffff") === 1, "a colour against itself should be 1:1");
// The house orange is documented in globals.css as failing AA for body text.
const orange = contrastRatio("#ff2d00", "#ffffff");
ok(orange > 3 && orange < 4.5,
   `the house orange should sit between 3:1 and 4.5:1 on white, got ${orange.toFixed(2)}`);
ok(contrastRatio("#19233b", "#ffffff") > 4.5,
   "navy on white should pass AA");

console.log(fails === 0 ? "check-tenant: pass" : `check-tenant: ${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
