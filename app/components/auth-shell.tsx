import Link from "next/link";
import { Logo, TenantMark } from "@/app/components/logo";
import type { Branding } from "@/lib/tenant/branding";

/** The tenant whose brand the sign-in screen wears. null means the house. */
export type AuthTenant = {
  isHouse: boolean;
  name: string;
  branding: Branding;
} | null;

const HOUSE_SUPPORT = "ops@primepeobrokers.com";

const EXAMPLE_LOG = [
  { who: "Broker", what: "opened a record · 14:32" },
  { who: "Admin", what: "exported 12 rows · 13:04" },
  { who: "Broker", what: "opened a record · 11:47" },
  { who: "Compliance", what: "reviewed a record · 09:12" },
];

/**
 * Split-screen frame for the auth pages, per the Auth design.
 *
 * Tenant-aware because this is what a partner's own user sees when they open
 * their subdomain and are not signed in. Rendering the Prime lockup, the
 * "Broker console" label and Prime's support address on a partner's domain was
 * the largest remaining white-label leak.
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
    <div className="grid min-h-screen grid-cols-[1fr_420px] bg-surface max-lg:grid-cols-1">
      <div className="flex flex-col px-10 pb-14 pt-8 max-sm:px-5">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center" aria-label={`${brandName} home`}>
            {isPartner ? <TenantMark tenant={tenant} size={30} /> : <Logo size={30} />}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center pt-12">
          <div
            className="w-full max-w-[452px] rounded-md border border-line bg-raised p-10 pb-[42px] shadow-[0_1px_2px_rgba(25,35,59,.05),0_18px_40px_-30px_rgba(25,35,59,.3)] max-sm:px-[22px] max-sm:py-[30px]"
            style={{ animation: "pv-in 250ms var(--pv-ease) both" }}
          >
            {children}
          </div>
        </div>

        <div className="flex justify-center gap-6 pt-10 font-mono text-[11px] tracking-[.06em] text-ink-faint">
          {/* Both of these pointed at /#trust, so TERMS never reached the
              terms page. Same bug as the marketing footer had. */}
          <Link href="/privacy" className="hover:text-ink">PRIVACY</Link>
          <Link href="/terms" className="hover:text-ink">TERMS</Link>
          <Link href="/" className="hover:text-ink">SITE</Link>
        </div>
      </div>

      <aside className="flex flex-col justify-between gap-10 bg-dark p-10 px-9 text-dark-ink max-lg:hidden">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.14em] text-ink-faint">
            {/* "Broker console" is the house product's name. A partner signing
                into their own portal is not opening a broker console. */}
            {isPartner ? "Partner portal" : "Broker console"}
          </div>
          <p className="mt-3.5 font-display text-[23px] font-semibold leading-[1.18] tracking-[-.015em] text-dark-ink-bright">
            Every record you open is logged with your name and the time.
          </p>
        </div>
        <div className="rounded-md border border-dark-line">
          <div className="border-b border-dark-line bg-dark-raised px-4 py-3 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
            Access log · example
          </div>
          {EXAMPLE_LOG.map((r, i) => (
            <div
              key={i}
              className="flex justify-between gap-4 border-b border-dark-line-soft px-4 py-3 font-mono text-xs last:border-b-0"
            >
              <span className="text-dark-ink-soft">{r.who}</span>
              <span className="text-ink-faint">{r.what}</span>
            </div>
          ))}
        </div>
        <div className="text-[13px] leading-relaxed text-ink-faint">
          Trouble getting in? Ask an admin on your team to resend the invite, or
          email{" "}
          <a href={`mailto:${supportEmail}`} className="text-dark-ink-soft">
            {supportEmail}
          </a>
          .
        </div>
      </aside>
    </div>
  );
}
