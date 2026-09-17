import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getSessionContext, signInRedirect, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyHost } from "@/lib/tenant/host";
import { parseBranding, type Branding } from "@/lib/tenant/branding";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

/**
 * Which tenant is this request for?
 *
 * Runs in Node, not on the Edge: proxy.ts only classifies the Host header
 * into a slug (it has no Node runtime option in Next 16 and no data cache), so
 * the database lookup lives here, per route, cached.
 */

/** Set by proxy.ts on every matched partner request. */
export const TENANT_HEADER = "x-pv-tenant-slug";
export const HOST_KIND_HEADER = "x-pv-host-kind";

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  branding: Branding;
  /** The house tenant: Prime PEO Brokers on the apex, not a partner. */
  isHouse: boolean;
}

/** Cache tag for one tenant, so the branding form can invalidate just it. */
export function tenantCacheTag(slug: string) {
  return `tenant:${slug}`;
}

/**
 * The columns that may leave the database. An explicit allowlist rather than
 * `*`, because this read runs with the service-role key.
 */
const TENANT_SELECT = "id, slug, name, branding, is_house, suspended_at";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  branding: unknown;
  is_house: boolean | null;
  suspended_at: string | null;
}

function toResolved(row: TenantRow): ResolvedTenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    branding: parseBranding(row.branding, row.name),
    isHouse: row.is_house === true,
  };
}

/**
 * slug -> tenant, cached across requests and across lambda instances.
 *
 * WHY THE SERVICE-ROLE CLIENT
 *
 * This runs for anonymous visitors on a partner landing page, and `anon` has
 * no RLS policy on any table (a deliberate stance since 0001). The
 * alternative, a `to anon` select policy on tenants, would make the client's
 * entire partner roster enumerable with one unauthenticated request:
 *
 *     GET /rest/v1/tenants?select=slug,name
 *
 * The anon key is NEXT_PUBLIC_ and ships in every client bundle, so that is a
 * competitive-intelligence leak, and column grants do not fix it because the
 * row SET is the problem. Reading server-side against TENANT_SELECT keeps the
 * exposure to one row the caller already named.
 *
 * WHY unstable_cache AND NOT "use cache"
 *
 * `"use cache"` requires cacheComponents: true in next.config.ts, which turns
 * every uncached dynamic read in the existing console into a build error. That
 * migration may be worth doing; it is not worth doing as a side effect of
 * Phase 3.
 *
 * DO NOT read headers() or cookies() inside this function. It takes the slug
 * as an argument and reads nothing request-scoped, which is exactly what makes
 * it cacheable; a request-scoped read in here throws at runtime.
 */
const loadTenantBySlug = unstable_cache(
  async (slug: string): Promise<ResolvedTenant | null> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tenants")
      .select(TENANT_SELECT)
      .eq("slug", slug)
      .maybeSingle<TenantRow>();

    if (error) {
      /*
        Throw rather than return null. A null would be CACHED as "this tenant
        does not exist" for the whole revalidate window, so one transient
        database blip would 404 a partner's portal for five minutes. The
        caller catches this and 404s only the request in front of it.
      */
      console.error("[tenant] slug lookup failed", { slug, message: error.message });
      throw new Error("tenant lookup failed");
    }

    // A suspended partner reads as absent, so access stops without deleting
    // rows that leads, notes and events still reference.
    if (!data || data.suspended_at) return null;
    return toResolved(data);
  },
  ["tenant-by-slug"],
  { revalidate: 300, tags: ["tenants"] },
);

/**
 * The house tenant, looked up by id so it never depends on a mutable slug.
 */
const loadHouseTenant = unstable_cache(
  async (): Promise<ResolvedTenant | null> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tenants")
      .select(TENANT_SELECT)
      .eq("id", DEFAULT_TENANT_ID)
      .maybeSingle<TenantRow>();

    if (error) {
      console.error("[tenant] house lookup failed", { message: error.message });
      throw new Error("tenant lookup failed");
    }
    if (!data) return null;

    // The house tenant is the house tenant whatever the column says: a
    // missing is_house (0009 not yet applied) must not turn the apex into a
    // partner portal.
    return { ...toResolved(data), isHouse: true };
  },
  ["tenant-house"],
  { revalidate: 300, tags: ["tenants"] },
);

/**
 * The tenant for the current request, or null if the host is not one this
 * deployment serves.
 *
 * React cache() dedupes within a single render pass, so the layout, the page
 * and any nested component share one lookup; unstable_cache dedupes across
 * requests. Both are needed and neither substitutes for the other.
 *
 * Calling this makes the route dynamic, because it reads headers(). Do not
 * call it from the root layout: that would de-optimise the statically
 * prerendered apex marketing page. Tenant-aware rendering belongs in the
 * portal layout.
 */
export const getTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const h = await headers();

  /*
    Prefer the proxy-injected slug, and fall back to parsing Host so that
    routes outside the proxy matcher still resolve. The proxy SETS this header
    (never appends) on every request it matches, so a client cannot spoof it
    on a covered path; on an uncovered path we are reading the real Host
    anyway.
  */
  const injected = h.get(TENANT_HEADER);
  const kind = injected
    ? ({ kind: "partner", slug: injected } as const)
    : classifyHost(h.get("host"));

  if (kind.kind === "unknown") return null;

  try {
    return kind.kind === "apex"
      ? await loadHouseTenant()
      : await loadTenantBySlug(kind.slug);
  } catch {
    // A lookup failure 404s this one request rather than 500ing, and is not
    // cached. See loadTenantBySlug.
    return null;
  }
});

/** The tenant, or a 404. For pages that cannot render without one. */
export async function requireTenant(): Promise<ResolvedTenant> {
  const tenant = await getTenant();
  if (!tenant) notFound();
  return tenant;
}

/**
 * The tenant id for a write on the current request.
 *
 * This is what replaces DEFAULT_TENANT_ID in the discovery flow: a submission
 * on a partner subdomain must land on that partner's tenant. Falls back to the
 * house tenant so an unrecognised host still captures the lead rather than
 * dropping it, since losing a lead is worse than filing one in the wrong
 * place.
 */
export async function currentTenantIdForWrite(): Promise<string> {
  const tenant = await getTenant();
  return tenant?.id ?? DEFAULT_TENANT_ID;
}

/**
 * Portal context: the signed-in user AND the tenant whose host they are on,
 * asserted to be the same tenant.
 *
 * THE HOLE THIS CLOSES
 *
 * GoTrue identities are global: one auth.users table serves every tenant. So
 * a partner-A user's password authenticates successfully against
 * partner-b.<apex>. RLS then denies them partner B's data, so it is not a
 * breach, but the shell would render as "signed in" over a set of empty
 * panels branded as partner B. That reads as a leak to anyone looking at it,
 * and it is indistinguishable from one without reading the policies.
 *
 * Signing them out is deliberate rather than merely redirecting: leaving a
 * valid cookie for the wrong host in place would bounce them straight back
 * here on the next request.
 *
 * Platform staff are refused too. Staff can read a partner's leads in the
 * console, which is the SOW requirement; browsing the partner's own portal as
 * if they were the partner is a different thing and not something Phase 3
 * sells.
 */
export async function requireTenantUser(): Promise<{
  ctx: SessionContext;
  tenant: ResolvedTenant;
}> {
  const tenant = await requireTenant();
  const ctx = await getSessionContext();
  // signInRedirect, not a bare path: a deactivated partner user holds a valid
  // token, so the proxy would bounce them straight back here and loop.
  if (!ctx) redirect(await signInRedirect("/portal"));

  if (ctx.tenantId !== tenant.id) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=wrong-portal");
  }

  return { ctx, tenant };
}
