import Link from "next/link";

import { cn } from "@/lib/utils";
import { LEGAL_ENTITY } from "@/lib/legal";
import { telHref } from "@/lib/tenant/branding";
import { HOUSE_NAME, type PartnerFooter } from "@/lib/tenant/partner";

/**
 * The provider disclosure, on every page of every tenant.
 *
 * The wording is the client's, hard-coded on purpose: it is not a tenant
 * setting. The only per-tenant inputs are the partner's names and contact
 * details. The Terms and Privacy links always lead to Prime's pages.
 *
 * Two versions. The house site keeps counsel's October text unchanged. A
 * partner's site (client's November 2026 template) says who presents the
 * site, who provides the services, whose name and logo are whose, and how to
 * reach the partner.
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
  partner,
  tone = "light",
  className,
}: {
  /** null on the house site, where there is no partner to name. */
  partner: PartnerFooter | null;
  tone?: "light" | "dark";
  className?: string;
}) {
  const link =
    tone === "dark"
      ? "text-dark-ink underline decoration-dark-ink/40 underline-offset-[3px] hover:decoration-dark-ink"
      : "text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink";

  const policies = (
    <span className="whitespace-nowrap">
      <Link href="/terms" className={link}>
        Terms
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href="/privacy" className={link}>
        Privacy
      </Link>
    </span>
  );

  if (!partner) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 text-[13px] leading-relaxed",
          tone === "dark" ? "text-dark-ink-soft" : "text-ink",
          className,
        )}
      >
        <p className="max-w-[88ch] [text-wrap:pretty]">
          Services provided by {LEGAL_ENTITY}, a licensed insurance producer.{" "}
          {policies}
        </p>
        <p>© {LEGAL_ENTITY}</p>
      </div>
    );
  }

  /*
    Phone, email, address: whichever are set, in the client's order. A tel:
    and a mailto: so a visitor on a phone can act on them; the address is
    text. Each item is kept whole on one line, and the separators wrap.
  */
  const contact: Array<{ key: string; node: React.ReactNode }> = [];
  if (partner.phone) {
    contact.push({
      key: "phone",
      node: (
        <a href={telHref(partner.phone)} className={link}>
          {partner.phone}
        </a>
      ),
    });
  }
  if (partner.email) {
    contact.push({
      key: "email",
      node: (
        <a href={`mailto:${partner.email}`} className={link}>
          {partner.email}
        </a>
      ),
    });
  }
  if (partner.address) {
    contact.push({ key: "address", node: <span>{partner.address}</span> });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-[13px] leading-relaxed",
        tone === "dark" ? "text-dark-ink-soft" : "text-ink",
        className,
      )}
    >
      <p className="max-w-[88ch] [text-wrap:pretty]">
        Presented by {partner.legalName} in partnership with {HOUSE_NAME}.
        Services provided by {LEGAL_ENTITY}, which performs the PEO and HCM
        evaluation. {policies}
      </p>
      {contact.length > 0 && (
        <p className="max-w-[88ch]">
          Contact {partner.displayName}:{" "}
          {contact.map((c, i) => (
            <span key={c.key}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {c.node}
            </span>
          ))}
        </p>
      )}
      <p className="max-w-[88ch] [text-wrap:pretty]">
        {/* "© All Staff, Inc." already ends the sentence; a second full stop
            would print "Inc.." */}
        {partner.displayName} name and logo © {partner.legalName}
        {partner.legalName.endsWith(".") ? "" : "."} Platform © {LEGAL_ENTITY}.
      </p>
    </div>
  );
}
