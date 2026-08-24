import Link from "next/link";
import { Wordmark } from "@/app/components/wordmark";

const EXAMPLE_LOG = [
  { who: "Broker", what: "opened a record · 14:32" },
  { who: "Admin", what: "exported 12 rows · 13:04" },
  { who: "Broker", what: "opened a record · 11:47" },
  { who: "Compliance", what: "reviewed a record · 09:12" },
];

/** Split-screen frame for the auth pages, per the Auth design. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[1fr_420px] bg-surface max-lg:grid-cols-1">
      <div className="flex flex-col px-10 pb-14 pt-8 max-sm:px-5">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Prime Vantage home">
            <Wordmark size={20} />
            <span className="font-display text-[15.5px] font-semibold">
              Prime Vantage
            </span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center pt-12">
          <div
            className="w-full max-w-[452px] rounded-[4px] border border-line bg-raised p-10 pb-[42px] shadow-[0_1px_2px_rgba(26,25,23,.05),0_18px_40px_-30px_rgba(26,25,23,.3)] max-sm:px-[22px] max-sm:py-[30px]"
            style={{ animation: "pv-in 250ms var(--pv-ease) both" }}
          >
            {children}
          </div>
        </div>

        <div className="flex justify-center gap-6 pt-10 font-mono text-[11px] tracking-[.06em] text-ink-faint">
          <Link href="/#trust" className="hover:text-ink">PRIVACY</Link>
          <Link href="/#trust" className="hover:text-ink">TERMS</Link>
          <Link href="/" className="hover:text-ink">SITE</Link>
        </div>
      </div>

      <aside className="flex flex-col justify-between gap-10 bg-dark p-10 px-9 text-dark-ink max-lg:hidden">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.14em] text-ink-faint">
            Broker console
          </div>
          <p className="mt-3.5 font-display text-[23px] font-semibold leading-[1.18] tracking-[-.015em] text-dark-ink-bright">
            Every record you open is logged with your name and the time.
          </p>
        </div>
        <div className="rounded-[4px] border border-dark-line">
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
          <a href="mailto:ops@primevantage.com" className="text-dark-ink-soft">
            ops@primevantage.com
          </a>
          .
        </div>
      </aside>
    </div>
  );
}
