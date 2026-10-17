import Link from "next/link";

import { cn } from "@/lib/utils";
import { LEGAL_ENTITY } from "@/lib/legal";

/**
 * The provider disclosure, on every page of every tenant.
 *
 * Counsel's wording, hard-coded on purpose: it is not a tenant setting, and
 * the only per-tenant input is the partner's legal name. The Terms and
 * Privacy links always lead to Prime's pages, and the copyright always names
 * Prime's legal entity, never the partner.
 *
 * Counsel asked for at least 12px and WCAG AA. Both tones use the strongest
 * ink token on their ground rather than a muted grey, because a partner can
 * re-theme the palette and the muted greys are derived from it: a partner
 * whose navy is only just dark enough would pull dark-ink-muted down to about
 * 3:1. The branding form holds ink to 4.5:1 on white and the dark colour to
 * 7:1 under white, so ink on light and dark-ink-soft on dark stay at or above
 * 4.5:1 for any palette a partner can save.
 *
 * No hooks, so it renders inside both server and client trees.
 */
export function LegalDisclosure({
  partnerLegalName,
  tone = "light",
  className,
}: {
  /** null on the house site, where there is no referral partner to name. */
  partnerLegalName: string | null;
  tone?: "light" | "dark";
  className?: string;
}) {
  const link =
    tone === "dark"
      ? "text-dark-ink underline decoration-dark-ink/40 underline-offset-[3px] hover:decoration-dark-ink"
      : "text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-[13px] leading-relaxed",
        tone === "dark" ? "text-dark-ink-soft" : "text-ink",
        className,
      )}
    >
      <p className="max-w-[88ch] [text-wrap:pretty]">
        Services provided by {LEGAL_ENTITY}, a licensed insurance producer.
        {partnerLegalName && (
          <>
            {" "}
            {partnerLegalName} is a referral partner; the PEO and HCM
            evaluation is performed by Prime.
          </>
        )}{" "}
        <span className="whitespace-nowrap">
          <Link href="/terms" className={link}>
            Terms
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
        </span>
      </p>
      <p>© {LEGAL_ENTITY}</p>
    </div>
  );
}
