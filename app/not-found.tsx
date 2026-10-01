import Link from "next/link";
import { CompassIcon } from "lucide-react";

import { Logo, TenantMark } from "@/app/components/logo";
import { Button } from "@/app/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty";
import { getTenant } from "@/lib/tenant/resolve";

export const metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * The 404.
 *
 * Without this file every mistyped URL, stale link and `notFound()` call
 * landed on Next's built-in screen: black, unbranded, and with no link
 * anywhere on it. On a site whose only job is to start a discovery flow, a
 * dead end is a lost lead, so this one always offers a way on.
 *
 * getTenant, not requireTenant: this renders when routing has already failed,
 * so it must never throw or redirect. A null tenant degrades to the house
 * brand, which is the correct fallback on an unrecognised host.
 *
 * A partner visitor is sent to their own homepage and their own discovery
 * flow, never to Prime's. Both live on the host they are already on, so the
 * relative hrefs are right for either tenant and there is nothing to branch
 * on beyond the mark and the name.
 */
export default async function NotFound() {
  const tenant = await getTenant();
  const partner = tenant && !tenant.isHouse ? tenant : null;
  const brandName = partner
    ? (partner.branding.companyName ?? partner.name)
    : "Prime PEO Brokers";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[68px] max-w-[820px] items-center px-10 max-sm:px-5">
          <Link
            href="/"
            className="flex items-center"
            aria-label={`${brandName} home`}
          >
            {partner ? <TenantMark tenant={partner} size={30} /> : <Logo size={30} />}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[820px] flex-1 items-center px-10 py-16 max-sm:px-5">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="frame">
              <CompassIcon />
            </EmptyMedia>
            <EmptyTitle className="font-display text-[clamp(23px,3.4vw,30px)] font-semibold tracking-[-.02em]">
              That page is not here.
            </EmptyTitle>
            <EmptyDescription>
              The link may be out of date, or the address mistyped. Nothing you
              have already submitted is affected.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-md flex-row flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/discovery">Start shopping</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to the homepage</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  );
}
