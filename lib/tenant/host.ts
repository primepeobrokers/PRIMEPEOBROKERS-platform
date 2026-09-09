/**
 * Host header parsing: which tenant is this request for?
 *
 * Pure string work, no I/O, no imports. That is a hard requirement, not a
 * style choice: this module is imported by proxy.ts, which runs on the Edge
 * runtime. Next 16's ProxyConfig has no `runtime` field (see
 * node_modules/next/dist/build/segment-config/middleware/middleware-config.d.ts),
 * so there is no Node option and nothing here may reach for `next/headers`,
 * the filesystem, or a database client.
 *
 * The slug -> tenant lookup lives in lib/tenant/resolve.ts instead, which runs
 * in Node where it can be cached.
 */

/**
 * The apex the site is served from, without a scheme. Partner subdomains are
 * one label in front of it.
 *
 * Dev note: `partner-a.localhost:3000` resolves to 127.0.0.1 in Chrome and
 * Safari with no /etc/hosts entry. Firefox does not do this.
 */
export const APEX_HOST = process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000";

/**
 * Labels that are never a partner, so a tenant can never be provisioned with
 * a slug that would shadow infrastructure. `tenants.slug` is unique but has no
 * idea what these mean, so the check has to live here.
 */
const RESERVED = new Set([
  "www",
  "app",
  "admin",
  "console",
  "portal",
  "api",
  "auth",
  "mail",
  "email",
  "smtp",
  "static",
  "assets",
  "cdn",
  "img",
  "images",
  "media",
  "files",
  "storage",
  "staging",
  "preview",
  "dev",
  "test",
  "vercel",
  "_vercel",
  "status",
  "docs",
  "blog",
  "support",
  "help",
]);

/**
 * Mirrors the DB constraint exactly: `slug ~ '^[a-z0-9-]{2,63}$'` on
 * public.tenants (migration 0001). Kept in step deliberately, so a host that
 * parses here is always a slug the database could hold. 63 is the DNS label
 * ceiling.
 */
const SLUG_RE = /^[a-z0-9-]{2,63}$/;

export type HostKind =
  | { kind: "apex" }
  | { kind: "partner"; slug: string }
  | { kind: "unknown" };

/**
 * Classifies a Host header into apex, a partner slug, or unknown.
 *
 * "unknown" means the host is not one this deployment serves, and callers
 * should 404 rather than guess. It is deliberately distinct from "apex": a
 * typo'd or spoofed Host must not silently fall back to the house tenant and
 * start showing Prime PEO's own leads.
 *
 * Preview deploys resolve to apex on purpose. Without that,
 * `prime-vintage-git-main-abc123.vercel.app` would be read as a request for
 * the tenant "prime-vintage-git-main-abc123", and every preview would 404.
 */
export function classifyHost(rawHost: string | null | undefined): HostKind {
  if (!rawHost) return { kind: "unknown" };

  // Host carries the port in dev ("partner-a.localhost:3000") and can arrive
  // with mixed case from a client. IDN/punycode hosts are left as-is: they
  // fail SLUG_RE and land in "unknown", which is the correct answer until
  // partners actually need non-ASCII subdomains.
  const host = rawHost.split(":")[0]!.trim().toLowerCase();
  const apex = APEX_HOST.split(":")[0]!.trim().toLowerCase();

  if (!host) return { kind: "unknown" };
  if (host === apex || host === `www.${apex}`) return { kind: "apex" };

  const underApex = host.endsWith(`.${apex}`);

  /*
    Vercel-assigned hostnames serve the house site: without this, a preview URL
    like prime-vintage-git-main-abc123.vercel.app would be read as a request
    for the tenant "prime-vintage-git-main-abc123" and every preview would 404.

    Checked only when the host is NOT under the apex, because the apex can
    itself be a vercel.app domain (it is today:
    prime-vintage.vercel.app). Testing this first would classify every real
    partner subdomain as apex and silently disable multi-tenancy.
  */
  if (!underApex && (host === "vercel.app" || host.endsWith(".vercel.app"))) {
    return { kind: "apex" };
  }

  // Anything not under the apex is a host this deployment does not serve.
  if (!underApex) return { kind: "unknown" };

  const label = host.slice(0, -(apex.length + 1));

  // Exactly one label deep. "a.b.clientdomain.com" is not a partner: a
  // wildcard TLS cert does not cover it either, so treating it as one would
  // promise something the certificate cannot deliver.
  if (!label || label.includes(".")) return { kind: "unknown" };

  if (RESERVED.has(label)) return { kind: "apex" };
  if (!SLUG_RE.test(label)) return { kind: "unknown" };

  return { kind: "partner", slug: label };
}
