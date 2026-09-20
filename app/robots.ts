import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { classifyHost } from "@/lib/tenant/host";
import { houseOrigin, tenantOrigin } from "@/lib/tenant/urls";

/**
 * Host-aware, because Phase 3 serves every partner subdomain from this same
 * deployment.
 *
 * Without this, `acme.clientdomain.com/robots.txt` would allow crawling of a
 * portal that sits entirely behind auth, and would point crawlers at the
 * HOUSE sitemap, advertising the client's own marketing URLs from a partner's
 * domain.
 *
 * Reading headers() makes this route dynamic. That is the correct trade here:
 * robots.txt is cheap, and a wrong one is a real SEO and confidentiality
 * problem.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = classifyHost((await headers()).get("host"));

  /*
    A partner host now serves a public marketing page at `/`, so this can no
    longer disallow everything: that would deindex the page the partner is
    paying for. Everything behind auth stays out, mirroring the apex rule
    below, plus /partner-home itself, which is the rewrite target for `/` and
    would otherwise be indexed as a duplicate of it.
  */
  if (host.kind === "partner") {
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/portal",
            "/partner-home",
            "/console",
            "/login",
            "/auth",
            "/discovery",
          ],
        },
      ],
      sitemap: `${tenantOrigin(host.slug, false)}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The flow itself and everything behind auth stays out of the index.
        // /partner-home is a rewrite target for partner hosts and 404s here,
        // but it is listed so a crawler never spends a request discovering it.
        disallow: [
          "/console",
          "/portal",
          "/partner-home",
          "/login",
          "/auth",
          "/discovery",
        ],
      },
    ],
    sitemap: `${houseOrigin()}/sitemap.xml`,
  };
}
