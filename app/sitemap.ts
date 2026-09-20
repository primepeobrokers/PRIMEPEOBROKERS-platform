import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { classifyHost } from "@/lib/tenant/host";
import { houseOrigin, tenantOrigin } from "@/lib/tenant/urls";

/**
 * Host-aware for the same reason as robots.ts: a partner subdomain must not
 * publish the house site's URLs.
 *
 * A partner host now has one public page, its branded marketing root, so it
 * lists that and nothing else. Everything else there is behind auth. The
 * legal pages are deliberately absent: they are Prime's documents and belong
 * in Prime's sitemap, not duplicated under every partner's domain.
 *
 * An unknown host gets an empty sitemap rather than a 404: an empty sitemap is
 * a valid, honest answer, where a 404 looks like a misconfiguration.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = classifyHost((await headers()).get("host"));

  if (host.kind === "partner") {
    return [
      {
        url: tenantOrigin(host.slug, false),
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 1,
      },
    ];
  }

  if (host.kind !== "apex") return [];

  const siteUrl = houseOrigin();
  const lastModified = new Date();
  return [
    { url: siteUrl, lastModified, changeFrequency: "monthly", priority: 1 },
    {
      url: `${siteUrl}/talk`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
