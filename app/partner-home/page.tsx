import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LandingSections } from "@/app/components/landing/landing-sections";
import { TenantTheme } from "@/app/components/tenant-theme";
import { tenantIcons } from "@/lib/tenant/favicon";
import { getTenant, requireTenant } from "@/lib/tenant/resolve";
import { tenantOrigin } from "@/lib/tenant/urls";

/**
 * The public marketing page on a partner's own subdomain.
 *
 * Reached only by rewrite: proxy.ts turns `/` on a partner host into this
 * route, so the visitor's URL stays `https://<partner>.<apex>/`. Nothing links
 * here by path, and on the apex the proxy leaves `/` alone, so the house site
 * keeps its statically prerendered page.
 *
 * Kept as a separate route rather than making app/page.tsx tenant-aware: the
 * house page must not read headers(), or it stops being prerendered. Only
 * partner hosts pay for the dynamic render.
 */
export async function generateMetadata(): Promise<Metadata> {
  // getTenant, not requireTenant: metadata runs before the page and must not
  // redirect or 404. The page body does the real check. Same split as the
  // portal layout.
  const tenant = await getTenant();
  if (!tenant || tenant.isHouse) return {};

  const name = tenant.branding.companyName ?? tenant.name;

  return {
    metadataBase: new URL(tenantOrigin(tenant.slug, false)),
    // The partner own mark in the browser tab, not Prime cube.
    icons: tenantIcons(tenant),
    // Overrides the house template in app/layout.tsx, which would otherwise
    // append "· Prime PEO Brokers" to a partner's own page title.
    title: {
      absolute: `${name}: the easiest way to shop for PEO, Payroll & HR tech`,
    },
    description:
      "Research, evaluate, and choose the right PEO, payroll, and HR software for free. Answer a structured set of questions once; an expert on our team does the legwork and delivers your tailored proposal. One advisor, every option. You never pay a fee.",
    alternates: { canonical: "/" },
    openGraph: { siteName: name, type: "website", url: tenantOrigin(tenant.slug, false) },
  };
}

export default async function PartnerHomePage() {
  /*
    requireTenant, not getTenant: an unknown or suspended slug must 404 here.
    Falling back to the house tenant would serve Prime's marketing page, logo
    and inbox from a partner's domain, which is the exact failure this page
    exists to prevent.
  */
  const tenant = await requireTenant();

  /*
    The house tenant must not render here.

    proxy.ts 404s /partner-home on the apex, but its matcher only covers
    arbitrary paths on PARTNER hosts, so an apex request for this path never
    reaches the proxy at all: the guard there cannot fire, and without this the
    apex would serve a second, dynamic copy of the marketing page for crawlers
    to find. Keeping the check here rather than widening the matcher avoids
    paying a proxy invocation on every apex request.
  */
  if (tenant.isHouse) notFound();

  return (
    <>
      <TenantTheme branding={tenant.branding} />
      <LandingSections
        tenant={{
          isHouse: tenant.isHouse,
          name: tenant.name,
          branding: tenant.branding,
        }}
      />
    </>
  );
}
