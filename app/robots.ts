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

  // A partner portal has nothing public. Disallow everything rather than
  // listing paths: there is no marketing surface here to index.
  if (host.kind === "partner") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${tenantOrigin(host.slug, false)}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The flow itself and everything behind auth stays out of the index.
        disallow: ["/console", "/portal", "/login", "/auth", "/discovery"],
      },
    ],
    sitemap: `${houseOrigin()}/sitemap.xml`,
  };
}
