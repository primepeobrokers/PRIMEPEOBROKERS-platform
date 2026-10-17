import Link from "next/link";
import { Logo } from "@/app/components/logo";
import { LegalDisclosure } from "@/app/components/legal-disclosure";
import { getTenant } from "@/lib/tenant/resolve";
import { partnerLegalName } from "@/lib/tenant/partner";

/**
 * Shared frame for the privacy policy and terms. Both now carry the
 * client-supplied legal copy, so the draft banner that flagged them as
 * unreviewed is gone. Outstanding placeholder values are tracked in a
 * TODO(client) comment at the top of each page.
 *
 * Reads the tenant only to name the partner in the footer disclosure. The
 * documents themselves are Prime's and identical on every host. That read
 * makes /terms and /privacy dynamic rather than prerendered, which is cheap
 * for two text pages and is the price of the disclosure being on every page.
 */
export async function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  const tenant = await getTenant();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-[rgba(255,255,255,.92)] backdrop-blur-[8px]">
        <div className="mx-auto flex h-[68px] max-w-[820px] items-center justify-between gap-8 px-10 max-sm:px-5">
          <Link href="/" className="flex items-center" aria-label="Prime PEO Brokers home">
            <Logo size={30} />
          </Link>
          <Link
            href="/discovery"
            className="whitespace-nowrap rounded-md bg-accent px-[17px] py-2.5 text-[14.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
          >
            Start shopping
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-10 pb-28 pt-14 max-sm:px-5">
        <h1 className="font-display text-[clamp(30px,5vw,44px)] font-semibold leading-[1.05] tracking-[-.03em]">
          {title}
        </h1>
        <div className="mt-3 font-mono text-[12px] uppercase tracking-[.1em] text-ink-muted">
          Last updated {lastUpdated}
        </div>

        <div className="mt-10 flex flex-col gap-9">{children}</div>

        <div className="mt-14 border-t border-line pt-7 text-[14.5px] text-ink-muted">
          Questions about this policy?{" "}
          <a
            href="mailto:admin@primepeobrokers.com"
            className="border-b border-accent/35 text-accent-press hover:border-accent-press hover:text-accent"
          >
            admin@primepeobrokers.com
          </a>
        </div>
      </main>

      <footer className="border-t border-line">
        <LegalDisclosure
          partnerLegalName={partnerLegalName(tenant)}
          className="mx-auto max-w-[820px] px-10 py-8 max-sm:px-5"
        />
      </footer>
    </>
  );
}

export function Section({
  id,
  heading,
  children,
}: {
  id?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-[21px] font-semibold tracking-[-.015em]">
        {heading}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[16px] leading-relaxed text-ink-soft [&_a]:border-b [&_a]:border-accent/35 [&_a]:text-accent-press [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
