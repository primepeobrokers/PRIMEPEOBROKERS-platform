import type { Metadata } from "next";

import { getTenant, requireTenantUser } from "@/lib/tenant/resolve";
import { tenantOrigin } from "@/lib/tenant/urls";
import { TenantTheme } from "@/app/components/tenant-theme";
import { TenantMark } from "@/app/components/logo";
import { signOut } from "@/app/login/actions";
import { Toaster } from "@/app/components/ui/sonner";
import { SignOutButton } from "@/app/console/sign-out-button";

/**
 * The partner portal shell.
 *
 * Deliberately not the console layout: that carries the staff nav, the Team
 * link and the Prime PEO wordmark. The SOW is explicit that partners need
 * "visibility, not workflow tooling", so this shell has a mark, a title and a
 * way out, and nothing else.
 *
 * Tenant-aware metadata and theming live here rather than in the root layout.
 * getTenant() reads headers(), which makes a route dynamic, and calling it
 * from the root layout would de-optimise the statically prerendered apex
 * marketing page.
 */
export async function generateMetadata(): Promise<Metadata> {
  // getTenant, not requireTenantUser: metadata is generated before the page
  // renders and must not redirect or 404. The layout body does the auth check.
  const tenant = await getTenant();
  const name = tenant?.branding.companyName ?? tenant?.name ?? "Portal";

  return {
    metadataBase: tenant
      ? new URL(tenantOrigin(tenant.slug, tenant.isHouse))
      : undefined,
    title: { default: name, template: `%s · ${name}` },
    // A partner portal sits behind auth and has nothing to index. Without
    // this a wildcard subdomain would invite crawlers onto every partner host.
    robots: { index: false, follow: false },
  };
}

export default async function PortalLayout({
  children,
}: LayoutProps<"/portal">) {
  const { ctx, tenant } = await requireTenantUser();

  const label = tenant.branding.shortName ?? tenant.branding.companyName ?? tenant.name;
  const who = ctx.fullName || ctx.email || "";

  return (
    <div className="min-h-screen bg-surface">
      <TenantTheme branding={tenant.branding} />

      <header className="bg-dark text-dark-ink">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-6 px-7 max-sm:px-[18px]">
          <div className="flex min-w-0 items-center gap-[11px]">
            <TenantMark tenant={tenant} size={26} variant="inverted" />
            <span className="truncate border-l border-dark-line pl-[11px] font-mono text-[10.5px] uppercase tracking-[.12em] text-dark-ink-muted max-sm:hidden">
              Leads
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <SignOutButton action={signOut} />
            <div
              title={who}
              className="flex h-[26px] items-center rounded-sm bg-dark-line px-2 font-mono text-[11px] text-dark-ink-soft max-sm:hidden"
            >
              <span className="sr-only">Signed in as </span>
              {label}
            </div>
          </div>
        </div>
      </header>

      {children}
      <Toaster />
    </div>
  );
}
