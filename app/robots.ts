import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The flow itself and everything behind auth stays out of the index.
        disallow: ["/console", "/login", "/auth", "/discovery"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
