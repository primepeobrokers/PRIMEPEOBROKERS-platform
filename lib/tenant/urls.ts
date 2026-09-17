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

/**
 * The link an invite or recovery email should carry.
 *
 * NOT Supabase's `action_link`. That URL goes through Supabase's own verify
 * endpoint, which consumes the one-time token there and then redirects to
 * our confirm route with the session in the URL fragment (implicit flow).
 * A server route never sees a fragment, so the confirm route found no
 * token_hash, bounced to /login?error=link, and the token was already spent:
 * the invite looked "expired" the instant it was clicked.
 *
 * Carrying `hashed_token` in the query instead lets the confirm route call
 * verifyOtp itself, on our origin, and set the session cookie there. This is
 * the pattern @supabase/ssr documents for email links.
 */
export function confirmUrl(
  origin: string,
  hashedToken: string,
  type: "invite" | "recovery" = "invite",
): string {
  const q = new URLSearchParams({ token_hash: hashedToken, type });
  return `${origin}/auth/confirm?${q.toString()}`;
}
