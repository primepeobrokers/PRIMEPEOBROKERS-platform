import { NextResponse } from "next/server";

import { letterTileSvg, partnerIcon } from "@/lib/tenant/favicon";
import { logoUrl } from "@/lib/tenant/branding";
import { getTenant } from "@/lib/tenant/resolve";

/**
 * The browser-tab icon for a partner's branded pages.
 *
 * A route rather than Next's file-based `icon.tsx` convention, because the
 * icon is per-tenant and resolved from the request Host. The file convention
 * is evaluated per route segment at build time and cannot vary by host.
 *
 * Two outcomes, decided by partnerIcon():
 * - a square-ish uploaded logo is redirected to, so the bytes are served by
 *   Supabase Storage and its CDN rather than proxied through the app;
 * - anything else gets a generated letter tile inline.
 *
 * The house site never reaches here: app/favicon.ico serves it, and a request
 * on the apex 404s below.
 */
export async function GET() {
  const tenant = await getTenant();

  /*
    404 rather than falling back to Prime's cube. A partner host that cannot
    resolve its tenant must not start flying the house flag, which is the
    exact leak the branded-homepage work exists to close. A missing favicon is
    a blank square; the wrong favicon is someone else's trademark.
  */
  if (!tenant || tenant.isHouse) {
    return new NextResponse(null, { status: 404 });
  }

  const icon = partnerIcon(tenant.branding, tenant.name);

  if (icon.kind === "logo") {
    /*
      Redirect, not a proxy. The logo already lives in a public Storage bucket
      behind a CDN, so streaming it through this route would add a hop, spend
      function time on every tab render, and lose the upstream cache headers.
    */
    return NextResponse.redirect(logoUrl(icon.path), 307);
  }

  return new NextResponse(letterTileSvg(icon.letter, icon.accent), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      /*
        Cached, but revalidated. A partner changing their accent colour should
        see the tab follow within the hour, while the common case costs
        nothing. Favicons are fetched aggressively and are not worth a
        function invocation each time.
      */
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
