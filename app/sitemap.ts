import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { classifyHost } from "@/lib/tenant/host";
import { houseOrigin } from "@/lib/tenant/urls";

/**
 * Host-aware for the same reason as robots.ts: a partner subdomain must not
 * publish the house site's URLs.
 *
 * A partner portal is entirely behind auth, so its sitemap is empty rather
 * than absent: an empty sitemap is a valid, honest answer, where a 404 looks
 * like a misconfiguration.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = classifyHost((await headers()).get("host"));
  if (host.kind !== "apex") return [];

  const siteUrl = houseOrigin();
  const lastModified = new Date();
  return [
    { url: siteUrl, lastModified, changeFrequency: "monthly", priority: 1 },
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
