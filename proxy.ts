import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { classifyHost } from "@/lib/tenant/host";

/**
 * Classifies the host, keeps the Supabase session cookie fresh, and gates the
 * console.
 *
 * The auth part is the optimistic check only. Every console page re-verifies
 * the session server-side, and RLS enforces tenant isolation at the data
 * layer, so a bug here cannot leak data.
 *
 * The host part is NOT a security boundary either: it decides which surface
 * renders and passes a slug downstream. What a signed-in person may actually
 * read is decided by tenant_scope() in the database (migration 0009).
 *
 * Runs on the Edge runtime. Next 16's ProxyConfig has no `runtime` field, so
 * there is no Node option here: no database client, no next/cache. That is
 * why the slug -> tenant lookup lives in lib/tenant/resolve.ts instead.
 */

/** Kept in step with lib/tenant/resolve.ts, which cannot be imported here. */
const TENANT_HEADER = "x-pv-tenant-slug";
const HOST_KIND_HEADER = "x-pv-host-kind";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = classifyHost(request.headers.get("host"));

  /*
    ORDERING IS LOAD-BEARING. These headers must be set BEFORE
    createServerClient, because NextResponse.next({ request }) snapshots
    request.headers at construction, and the setAll callback below rebuilds
    the response mid-getUser(). Setting them afterwards compiles, runs, and
    silently never reaches the server components.

    set(), never append(): this overwrites anything a client sent, so
    `curl -H 'x-pv-tenant-slug: victim'` cannot choose its own tenant on any
    path this proxy matches.
  */
  request.headers.set(HOST_KIND_HEADER, host.kind);
  if (host.kind === "partner") {
    request.headers.set(TENANT_HEADER, host.slug);
  } else {
    request.headers.delete(TENANT_HEADER);
  }

  // A host this deployment does not serve. Not 404'd here: the route reads
  // the header and decides, so a stray Host on an asset path still works.

  /*
    Surface routing. A partner subdomain has no marketing site and no staff
    console; the apex has no partner portal. Rewrites rather than redirects,
    so the URL the partner sees stays their own.

    This is convenience and clarity, not enforcement: requireStaff() and
    requireTenantUser() re-check server-side, and RLS is the real boundary.
  */
  if (host.kind === "partner") {
    if (pathname.startsWith("/console")) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/portal", request.url));
    }
  } else if (pathname.startsWith("/portal")) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  /*
    Nothing to refresh and nothing to gate: skip the auth round trip entirely.
    Without this, an anonymous visitor landing on a partner's public page would
    pay a Supabase call before the page started rendering. Cookie names are
    `sb-<ref>-auth-token`, so the prefix is the reliable test.
  */
  const gated = pathname.startsWith("/console") || pathname.startsWith("/portal");
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!gated && !hasSessionCookie) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the token if expired, which Server Components require.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (pathname.startsWith("/console") || pathname.startsWith("/portal"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    // A partner has no console. Their portal is the root of their own host.
    url.pathname = host.kind === "partner" ? "/" : "/console";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /*
    The apex entries are unchanged, so `/` and `/discovery` on the house site
    still run no proxy code and pay no getUser().

    The last entry is host-gated with `has: [{ type: 'host' }]`, which Next
    evaluates in the routing layer before invoking this function, so it
    matches partner subdomains only. That is what lets a partner request be
    classified on every path (including `/`) without slowing the marketing
    page down.

    Matcher values must be statically analysable at build time, so the host
    pattern cannot interpolate NEXT_PUBLIC_APEX_HOST and has to be kept in
    step with it by hand. scripts/check-proxy.mts asserts they agree.

    The pattern names the production apex. Vercel preview hosts
    (*.vercel.app) are not matched here and classify as apex in
    lib/tenant/host.ts, so a preview serves the house site and partner
    subdomains can only be exercised on production or on localhost.
  */
  matcher: [
    "/console/:path*",
    "/login",
    "/auth/:path*",
    {
      source: "/:path*",
      has: [
        {
          type: "host",
          value: "(?<pvslug>[a-z0-9-]{2,63})\\.primevantagehcm\\.com",
        },
      ],
    },
  ],
};
