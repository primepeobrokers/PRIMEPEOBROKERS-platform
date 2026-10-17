import Link from "next/link";
import { Logo, TenantMark } from "@/app/components/logo";
import { LegalDisclosure } from "@/app/components/legal-disclosure";
import { partnerLegalName } from "@/lib/tenant/partner";
import type { Branding } from "@/lib/tenant/branding";

/** The tenant whose brand the sign-in screen wears. null means the house. */
export type AuthTenant = {
  isHouse: boolean;
  name: string;
  branding: Branding;
} | null;

const HOUSE_SUPPORT = "ops@primepeobrokers.com";

/**
 * Frame for the auth pages: the mark, the card, and the links under it.
 *
 * This used to be a split screen with a navy panel beside the card, carrying a
 * product label, a line about access logging, and a mock access log. The
 * client asked for the panel removed, so the card is now the only thing on the
 * page.
 *
 * One element in that panel was load-bearing: the support address. It is the
 * only way to reach a human for someone who cannot sign in, so it moved under
 * the card rather than going with the rest.
 *
 * Still tenant-aware. A partner's user signing in on their own subdomain sees
 * their mark and their support address, never Prime's.
 */
export function AuthShell({
  children,
  tenant = null,
}: {
  children: React.ReactNode;
  tenant?: AuthTenant;
}) {
  const isPartner = tenant !== null && !tenant.isHouse;
  const brandName = isPartner
    ? (tenant.branding.companyName ?? tenant.name)
    : "Prime PEO Brokers";
  const supportEmail = isPartner
    ? (tenant.branding.supportEmail ?? HOUSE_SUPPORT)
    : HOUSE_SUPPORT;

  return (
    <div className="flex min-h-dvh flex-col bg-surface px-10 pb-10 pt-7 max-sm:px-5">
      <Link
        href="/"
        className="flex w-fit items-center"
        aria-label={`${brandName} home`}
      >
        {isPartner ? <TenantMark tenant={tenant} size={30} /> : <Logo size={30} />}
      </Link>

      {/*
        The card centres in whatever is left below the mark. It used to carry a
        pt-12 offset so it sat against a full-height panel on the right; with
        the panel gone that offset only pushed the page off centre, and the
        column came to 900px inside a min-h-screen, so the sign-in screen
        scrolled on any laptop shorter than that. The spacing here is set so
        the whole thing fits a 13-inch screen.
      */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
        <div
          className="w-full max-w-[452px] rounded-md border border-line bg-raised p-10 pb-[42px] shadow-[0_1px_2px_rgba(25,35,59,.05),0_18px_40px_-30px_rgba(25,35,59,.3)] max-sm:px-[22px] max-sm:py-[30px]"
          style={{ animation: "pv-in 250ms var(--pv-ease) both" }}
        >
          {children}
        </div>

        <p className="max-w-[62ch] text-center text-[13px] leading-relaxed text-ink-muted">
          Trouble getting in? Ask an admin on your team to resend the invite, or
          email{" "}
          <a
            href={`mailto:${supportEmail}`}
            className="border-b border-accent/35 text-accent-press hover:border-accent-press hover:text-accent"
          >
            {supportEmail}
          </a>
          .
        </p>

        {/* Counsel's disclosure, which carries the Terms and Privacy links
            this row used to hold. The mark above is the link home. */}
        <LegalDisclosure
          partnerLegalName={partnerLegalName(tenant)}
          className="max-w-[62ch] items-center text-center"
        />
      </div>
    </div>
  );
}
