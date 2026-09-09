/**
 * The proxy matcher's host pattern cannot be built from an env var: Next
 * requires matcher values to be statically analysable at build time. So the
 * apex appears twice, as a literal regex in proxy.ts and as
 * NEXT_PUBLIC_APEX_HOST, and nothing at runtime notices when they disagree.
 *
 * The failure is silent and total: a partner subdomain stops matching the
 * matcher, so no tenant header is injected, and every partner request falls
 * back to whatever classifyHost makes of the bare Host. This asserts they
 * agree, and that the pattern still admits exactly the slugs the database can
 * hold.
 */
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

const proxySrc = readFileSync("proxy.ts", "utf8");

// The apex as configured. Mirrors the default in lib/tenant/host.ts.
const apexHost = (process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000")
  .split(":")[0]!
  .toLowerCase();

// ---------------------------------------------------------------------------
// 1. There is exactly one host-gated matcher entry, and we can read it.
// ---------------------------------------------------------------------------
const hostValues = [...proxySrc.matchAll(/type:\s*"host",\s*\n?\s*value:\s*"([^"]+)"/g)]
  .map((m) => m[1]!);

ok(hostValues.length === 1,
   `expected exactly one host matcher in proxy.ts, found ${hostValues.length}`);

if (hostValues.length === 1) {
  /*
    Read from source, so a `\.` in the running program appears here as the two
    characters `\` and `\` followed by `.`. Collapse the source-level escaping
    first, or every subsequent comparison is against a string the runtime
    never sees.
  */
  const raw = hostValues[0]!.replace(/\\\\/g, "\\");

  // Substitute the named slug group out, leaving the literal host behind.
  const literal = raw.replace(/\(\?<[a-z]+>\[a-z0-9-\]\{2,63\}\)/i, "SLUG");
  const apexInPattern = literal.replace(/^SLUG\\?\./, "").replace(/\\/g, "");

  ok(apexInPattern === apexHost,
     `proxy.ts matcher targets "${apexInPattern}" but NEXT_PUBLIC_APEX_HOST is "${apexHost}". ` +
     `Partner subdomains would not match the matcher, so no tenant header would be injected.`);

  // ---------------------------------------------------------------------------
  // 2. The slug group must accept exactly what tenants.slug accepts.
  // ---------------------------------------------------------------------------
  ok(raw.includes("[a-z0-9-]{2,63}"),
     "the matcher's slug group no longer matches the tenants.slug constraint (^[a-z0-9-]{2,63}$)");

  // Behavioural check: build the regex and run real hosts through it.
  const re = new RegExp(`^${raw}$`);
  for (const good of ["acme", "a-b-c", "p1", "a".repeat(63)]) {
    ok(re.test(`${good}.${apexHost}`), `matcher should match "${good}.${apexHost}"`);
  }
  for (const bad of ["x", "a".repeat(64), "under_score", "UPPER"]) {
    ok(!re.test(`${bad}.${apexHost}`), `matcher should NOT match "${bad}.${apexHost}"`);
  }
  // The apex itself must not match, or the house site would be treated as a
  // partner and every marketing page would pay the partner code path.
  ok(!re.test(apexHost), `matcher should not match the apex itself ("${apexHost}")`);
  ok(!re.test(`a.b.${apexHost}`), "matcher should not match a two-label subdomain");
}

// ---------------------------------------------------------------------------
// 3. The apex entries must still be present, or the console loses its gate.
// ---------------------------------------------------------------------------
for (const entry of ['"/console/:path*"', '"/login"', '"/auth/:path*"']) {
  ok(proxySrc.includes(entry), `the proxy matcher no longer includes ${entry}`);
}

// ---------------------------------------------------------------------------
// 4. The ordering hazard, asserted structurally.
//
// NextResponse.next({ request }) snapshots request.headers at construction,
// and the setAll callback rebuilds the response during getUser(). If the
// tenant headers are set after the Supabase client is created, they silently
// never reach the server components. Position in the file is the only thing
// that distinguishes working from broken here, so assert it.
// ---------------------------------------------------------------------------
const iHeaderSet = proxySrc.indexOf("request.headers.set(HOST_KIND_HEADER");
const iClient = proxySrc.indexOf("createServerClient(");
ok(iHeaderSet !== -1, "proxy.ts no longer sets the host-kind header");
ok(iClient !== -1, "proxy.ts no longer creates a Supabase client");
ok(iHeaderSet !== -1 && iClient !== -1 && iHeaderSet < iClient,
   "the tenant headers must be set BEFORE createServerClient, or the response " +
   "rebuilt inside setAll will not carry them");

// set(), not append(): otherwise a client-supplied header would survive and a
// request could name its own tenant.
ok(!/request\.headers\.append\(\s*TENANT_HEADER/.test(proxySrc),
   "the tenant header must be set(), never append()ed, or it could be spoofed");
ok(proxySrc.includes("request.headers.delete(TENANT_HEADER)"),
   "a non-partner host must clear the tenant header, or a spoofed value could survive");

console.log(fails === 0 ? "check-proxy: pass" : `check-proxy: ${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
