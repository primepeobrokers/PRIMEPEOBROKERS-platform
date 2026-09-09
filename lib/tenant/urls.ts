import { APEX_HOST } from "@/lib/tenant/host";

/**
 * Absolute origins, per tenant.
 *
 * NEXT_PUBLIC_SITE_URL is a single global constant, and it drives metadataBase
 * (app/layout.tsx), every link in every email (lib/email.ts) and the invite
 * redirectTo (app/console/team/actions.ts). On a partner subdomain all three
 * would point at the apex, which for the invite link is not cosmetic: the
 * confirm route would set the auth cookie on the wrong origin, so the partner
 * would land signed in on the house site and signed out on their own portal.
 *
 * No "server-only": app/layout.tsx and metadata helpers are shared modules,
 * and this reads only NEXT_PUBLIC_ values.
 */

/** The house origin, from the existing env var. */
export function houseOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * The origin a given tenant is served from.
 *
 * The scheme follows the house origin rather than NODE_ENV, so a preview or a
 * self-hosted http deployment does not end up minting https links it cannot
 * serve.
 */
export function tenantOrigin(slug: string, isHouse: boolean): string {
  if (isHouse) return houseOrigin();
  const scheme = houseOrigin().startsWith("https://") ? "https" : "http";
  return `${scheme}://${slug}.${APEX_HOST}`;
}
