import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/app/components/logo";
import { RevealInit } from "@/app/components/reveal";
import { Faq } from "@/app/components/faq";
import { PROOF_READY, OUTCOMES, QUOTES } from "@/lib/content/proof";
import { STEPS } from "@/lib/discovery/schema";

export const metadata: Metadata = {
  title: "Prime PEO Brokers: the easiest way to shop for PEO, Payroll & HR tech",
  description:
    "Research, evaluate, and choose the right PEO, payroll, and HR software for free. Answer a structured set of questions once; a Prime PEO Brokers expert does the legwork and delivers your tailored proposal. No pushy vendor reps. You never pay us.",
  alternates: { canonical: "/" },
};

const LEDGER = [
  { label: "Company", value: "Northgate Logistics", delay: "260ms" },
  { label: "Full-time employees", value: "142", delay: "320ms" },
  { label: "Contractors (1099)", value: "18", delay: "380ms" },
  { label: "Current setup", value: "Bundled PEO", delay: "440ms" },
  { label: "Benefits spend / year", value: "$418,200", delay: "500ms" },
  { label: "Renewal date", value: "2027-01-31", delay: "560ms" },
  { label: "States operated in", value: "4", delay: "620ms" },
];

const PROBLEMS = [
  {
    n: "01",
    title: "Pricing you cannot compare",
    body: "One provider quotes per employee per month, the next quotes a percentage of payroll, the third bundles admin into the benefits load. The same company gets three numbers that do not sit on the same axis.",
    stat: "3 bases",
    statNote: "Typical number of incompatible pricing structures in one shortlist",
  },
  {
    n: "02",
    title: "Mismatched to your stage",
    body: "A 30-person company gets sold the enterprise service model. A 200-person company gets a platform built for 15. Providers rarely disqualify themselves.",
    stat: "10–250",
    statNote: "Employee band where model fit changes three times",
  },
  {
    n: "03",
    title: "Renewal traps",
    body: "Rate increases land 45 days before renewal, past the window to run a real comparison. Termination clauses and payroll cutovers do the rest.",
    stat: "45 days",
    statNote: "Common notice window on a renewal increase",
  },
];

/*
 * The six steps, described for the landing page. Titles come from the schema
 * so they cannot drift from the real flow. The field counts are deliberately
 * absent: the count now varies by category (39 to 46 fields), so a fixed
 * number on this page would be wrong for most visitors.
 */
const FLOW_STEPS = [
  {
    n: "1",
    title: STEPS[0].title,
    body: "PEO, payroll, HRIS, recruiting, performance, or learning. What you pick decides what we ask next.",
  },
  {
    n: "2",
    title: STEPS[1].title,
    body: "Who is running the search, and the company it is for. Size and footprint shape every recommendation.",
  },
  {
    n: "3",
    title: STEPS[2].title,
    body: "How your people are classified and paid, who runs payroll today, and what you pay them. Ranges are fine.",
  },
  {
    n: "4",
    title: STEPS[3].title,
    body: "Time tracking, the HR support you need, and what you offer today. Bands, never individual salaries.",
  },
  {
    n: "5",
    title: STEPS[4].title,
    body: "What is driving this, what you want quoted alongside it, and the timeline you are working to.",
  },
  {
    n: "6",
    title: STEPS[5].title,
    body: "Renewal dates, anything else your advisor should know, and how you would like the proposal delivered.",
  },
];

const MODELS = [
  {
    name: "Full-service PEO",
    fit: "10–150",
    basis: "% of gross payroll",
    breaks: "Cost scales with raises, not service used",
    quotes: "14",
  },
  {
    name: "ASO / unbundled admin",
    fit: "25–250",
    basis: "Per employee, per month",
    breaks: "You retain plan liability and filings",
    quotes: "9",
  },
  {
    name: "Payroll bureau only",
    fit: "5–80",
    basis: "Per run + per payslip",
    breaks: "No benefits leverage, no HR cover",
    quotes: "11",
  },
  {
    name: "HRIS + external broker",
    fit: "50–250+",
    basis: "Licence + commission",
    breaks: "Two vendors, one blames the other",
    quotes: "7",
  },
  {
    name: "Industry captive",
    fit: "40–250",
    basis: "Pooled loss-rated",
    breaks: "Exit is slow and rate-sensitive",
    quotes: "4",
  },
];

const SEGMENTS = [
  {
    range: "10–35",
    title: "First real structure",
    body: "You are past spreadsheets and need compliant payroll, a benefits plan people accept, and one place to handle it.",
    note: "PEO usually wins on plan access alone.",
    highlight: false,
  },
  {
    range: "36–90",
    title: "The expensive middle",
    body: "Big enough that percentage-of-payroll pricing starts to hurt, small enough that you cannot self-insure anything.",
    note: "Where we find the largest deltas.",
    highlight: true,
  },
  {
    range: "91–180",
    title: "Unbundling",
    body: "You have an HR function. The question becomes which pieces to keep in-house and what to pay for the rest.",
    note: "ASO and HRIS models come into range.",
    highlight: false,
  },
  {
    range: "181–250",
    title: "Leverage",
    body: "Your claims history is credible enough to rate on. Pooled arrangements start to cost more than they return.",
    note: "Multi-state filings drive the decision.",
    highlight: false,
  },
];

const TRUST = [
  {
    tag: "In transit & at rest",
    title: "Encrypted both ways",
    body: "TLS 1.3 in transit, AES-256 at rest. Your record lives in a database with no public or anonymous read path.",
  },
  {
    tag: "Never sold",
    title: "No data resale, no list rental",
    body: "Your submission is not sold, syndicated, or shared with a data broker. There is no version of our business where it is.",
  },
  {
    tag: "Access",
    title: "Named staff only",
    body: "Your assigned broker and their team. Access is authenticated and scoped at the data layer, not just the interface.",
  },
  {
    tag: "Retention",
    title: "Deleted on request, in 30 days",
    body: "Ask and we delete the record and the partial drafts within 30 days, excluding what we must retain for licensing.",
  },
];

const FAQS = [
  {
    q: "Is this actually free?",
    a: "Yes. We are paid a commission by the provider you choose, at the same rate whether you come through us or not. If you pick nobody, we are paid nothing.",
  },
  {
    q: "Why do you need headcount and compensation ranges?",
    a: "Because every model in this market is priced off them. Without headcount, worker classification, and a benefits spend range, a quote is a guess. Ranges are acceptable everywhere in the flow.",
  },
  {
    q: "Do providers see my submission?",
    a: "Not until you approve it. Your broker reviews the record first and tells you which providers they intend to quote. You confirm the list.",
  },
  {
    q: "What happens after I submit?",
    a: "A broker reads your record within one business day and sends a written comparison of the models that fit. If something in your record is ambiguous, they ask before quoting.",
  },
  {
    q: "Can I stop halfway?",
    a: "Yes. Each answered step is saved. We email you a link that returns you to the step you left, and the partial record stays private to your broker.",
  },
  {
    q: "We already have a broker of record. Can you still help?",
    a: "We can model your current arrangement against the market for comparison, but we cannot quote a provider where another broker holds the appointment for your plan year.",
  },
  {
    q: "Do you work outside the US?",
    a: "No. US-domiciled employers only. For overseas headcount we can point you to an EOR, which we do not broker.",
  },
];

/*
 * Named on the home page as the platforms we compare. Taken from the original
 * site's own tech-stack question, so this is the client's list. Flagged for
 * client sign-off before launch: naming vendors sits next to the "no sponsored
 * rankings" claim.
 */
const PLATFORMS = [
  "ADP",
  "Paychex",
  "Gusto",
  "Rippling",
  "Paylocity",
  "Paycom",
];

const FOOTER_COLS = [
  {
    head: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "What we compare", href: "/#compare" },
      { label: "Start discovery", href: "/discovery" },
      { label: "For brokers", href: "/#brokers" },
    ],
  },
  {
    head: "Company",
    links: [
      { label: "About", href: "/#how" },
      { label: "Contact", href: "mailto:hello@primepeobrokers.com" },
      { label: "Renewals", href: "/#renewals" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    head: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Data handling", href: "/#trust" },
      { label: "Do not sell my data", href: "/privacy#resale" },
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="bg-surface">
      <RevealInit />

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-line bg-[rgba(255,255,255,.92)] backdrop-blur-[8px]">
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-8 px-10 max-sm:gap-3 max-sm:px-5">
          <Link href="/" className="flex items-center" aria-label="Prime PEO Brokers home">
            <Logo size={34} />
          </Link>
          <nav
            aria-label="Primary"
            className="flex items-center gap-[30px] text-[14.5px] max-md:hidden"
          >
            <a href="#how" className="text-ink-soft hover:text-accent-press">How it works</a>
            <a href="#compare" className="text-ink-soft hover:text-accent-press">What we compare</a>
            <a href="#renewals" className="text-ink-soft hover:text-accent-press">Renewals</a>
            <a href="#brokers" className="text-ink-soft hover:text-accent-press">For brokers</a>
            <a href="#trust" className="text-ink-soft hover:text-accent-press">Data handling</a>
            <a href="#faq" className="text-ink-soft hover:text-accent-press">FAQ</a>
          </nav>
          <div className="flex min-w-0 items-center gap-[18px] max-sm:gap-2.5">
            <Link
              href="/login"
              className="whitespace-nowrap text-[14.5px] text-ink-soft hover:text-accent-press"
            >
              Sign in
            </Link>
            <Link
              href="/discovery"
              className="whitespace-nowrap rounded-md bg-accent px-[17px] py-2.5 text-[14.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press max-sm:px-3"
            >
              Start shopping
            </Link>
          </div>
        </div>
      </header>

      {/* HERO · animated backdrop of open-licence footage (Pexels licence) */}
      <section className="relative overflow-hidden bg-dark">
        <div aria-hidden className="absolute inset-0 overflow-hidden bg-dark">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/photography/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover [filter:grayscale(1)_contrast(1.22)_brightness(.5)]"
          >
            <source
              src="https://videos.pexels.com/video-files/3130284/3130284-uhd_2560_1440_30fps.mp4"
              type="video/mp4"
            />
          </video>
          <div className="absolute inset-0 bg-accent opacity-55 mix-blend-color" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px)",
              backgroundSize: "100% 27px",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg,rgba(25,35,59,.96) 0%,rgba(25,35,59,.88) 38%,rgba(25,35,59,.6) 74%,rgba(25,35,59,.46) 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[120px]"
            style={{
              background: "linear-gradient(to bottom,rgba(25,35,59,0),var(--pv-dark))",
            }}
          />
        </div>
        <div className="relative mx-auto grid max-w-[1240px] grid-cols-[1.02fr_1fr] items-start gap-[72px] px-10 pb-24 pt-[88px] [&>*]:min-w-0 max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-5">
        <div>
          <div
            className="font-mono text-[11.5px] uppercase tracking-[.14em] text-dark-ink-muted"
            style={{ animation: "pv-in 500ms var(--pv-ease) both" }}
          >
            PEO · Payroll · HR
          </div>
          <h1
            className="mt-[22px] font-display text-[clamp(34px,6.4vw,60px)] font-semibold leading-[1.02] tracking-[-.032em] text-dark-ink-bright [text-wrap:balance]"
            style={{ animation: "pv-in 500ms var(--pv-ease) 50ms both" }}
          >
            The easiest way to shop for PEO, Payroll &amp; HR tech.
          </h1>
          <p
            className="mt-6 max-w-[50ch] text-[19px] leading-normal text-line-strong [text-wrap:pretty]"
            style={{ animation: "pv-in 500ms var(--pv-ease) 100ms both" }}
          >
            Research, evaluate, and choose the right PEO, payroll, and HR
            software for free. Answer a structured set of questions once; a
            Prime PEO Brokers expert does the legwork and delivers your
            tailored proposal. No pushy vendor reps. You never pay us.
          </p>
          <div
            className="mt-[34px] flex flex-wrap gap-3.5"
            style={{ animation: "pv-in 500ms var(--pv-ease) 150ms both" }}
          >
            <Link
              href="/discovery"
              className="rounded-md bg-accent px-[26px] py-[15px] text-base font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px"
            >
              Start shopping
            </Link>
            <a
              href="#how"
              className="rounded-md border border-ink-muted px-6 py-[15px] text-base font-semibold text-dark-ink transition-colors duration-150 hover:border-dark-ink hover:bg-[rgba(255,255,255,.08)]"
            >
              How it works
            </a>
          </div>
          <div
            className="mt-4 text-[13.5px] text-dark-ink-muted"
            style={{ animation: "pv-in 500ms var(--pv-ease) 175ms both" }}
          >
            Free to start · No sales calls · Renewing? We will benchmark your
            deal
          </div>
          <div
            className="mt-9 flex gap-[34px] border-t border-dark-line pt-[26px] max-sm:flex-wrap max-sm:gap-[22px]"
            style={{ animation: "pv-in 500ms var(--pv-ease) 200ms both" }}
          >
            {[
              ["6 min", "Median time to complete"],
              ["1 day", "Broker reads your record within"],
              ["$0", "Cost to you, ever"],
            ].map(([fig, note]) => (
              <div key={fig}>
                <div className="font-mono text-[26px] font-medium tracking-[-.02em] text-dark-ink-bright">
                  {fig}
                </div>
                <div className="mt-[5px] text-[13.5px] text-ink-disabled">{note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* the record fills in on load */}
        <div
          className="overflow-hidden rounded-md border border-line bg-raised shadow-[0_1px_2px_rgba(25,35,59,.05),0_18px_40px_-26px_rgba(25,35,59,.3)]"
          style={{ animation: "pv-in 500ms var(--pv-ease) 120ms both" }}
        >
          <div className="flex items-center justify-between border-b border-line bg-sunken px-[22px] py-3.5">
            <div className="font-mono text-[11px] uppercase tracking-[.13em] text-ink-muted">
              Discovery record · draft
            </div>
            <div className="font-mono text-[11px] tracking-[.06em] text-positive-deep">
              6 / 6 ANSWERED
            </div>
          </div>
          {LEDGER.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-6 border-b border-sunken px-[22px] py-[15px]"
              style={{ animation: `pv-row 420ms var(--pv-ease) ${r.delay} both` }}
            >
              <div className="min-w-0 text-[14.5px] text-ink-soft">{r.label}</div>
              <div className="shrink-0 whitespace-nowrap text-right font-mono text-[14.5px]">
                {r.value}
              </div>
            </div>
          ))}
          <div
            className="flex items-end justify-between gap-5 border-t border-[color-mix(in oklab,var(--pv-accent) 18%,transparent)] bg-[color-mix(in oklab,var(--pv-accent) 5%,transparent)] px-[22px] py-5"
            style={{ animation: "pv-row 420ms var(--pv-ease) 560ms both" }}
          >
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-[.13em] text-accent">
                Modelled annual delta
              </div>
              <div className="mt-1.5 text-[13px] text-ink-muted">
                Range across four provider models
              </div>
            </div>
            <div className="shrink-0 whitespace-nowrap font-mono text-[27px] font-medium tracking-[-.02em] text-accent">
              −$52,900
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* TRUST STRIP · the four promises from the original site */}
      <section className="border-b border-line bg-tint">
        <div
          data-stagger
          className="mx-auto grid max-w-[1240px] grid-cols-4 gap-8 px-10 py-6 max-lg:grid-cols-2 max-lg:gap-6 max-sm:grid-cols-1 max-sm:px-5"
        >
          {[
            "Free for our users, always",
            "Expert advisor, no pushy reps",
            "No sponsored rankings",
            "Your data stays yours",
          ].map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="mt-0.5 h-4 w-4 flex-none text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5 6.2 12 13 4.5" />
              </svg>
              <span className="text-[14.5px] leading-snug text-ink-soft">
                {line}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* PLATFORM STRIP */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-10 gap-y-4 px-10 py-7 max-sm:px-5">
          <div className="text-[14.5px] text-ink-muted">
            Compare across the leading PEO, payroll &amp; HR platforms
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {PLATFORMS.map((name) => (
              <span
                key={name}
                className="font-display text-[15px] font-semibold tracking-[-.01em] text-ink-faint"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section data-reveal className="border-t border-line bg-tint">
        <div className="mx-auto max-w-[1240px] px-10 pb-[84px] pt-[76px] max-sm:px-5">
          <div className="grid grid-cols-[340px_1fr] [&>*]:min-w-0 items-start gap-16 max-lg:grid-cols-1 max-lg:gap-10">
            <div>
              <div className="pv-label !text-[11.5px]">Why direct goes badly</div>
              <h2 className="mt-4 font-display text-[clamp(27px,3.6vw,36px)] font-semibold leading-[1.06] tracking-[-.025em] [text-wrap:balance]">
                Three ways this market takes money from you.
              </h2>
              <figure className="mb-0 ml-0 mr-0 mt-[26px] overflow-hidden border border-line bg-dark">
                <Image
                  src="/photography/paperwork.jpg"
                  alt="Rows of high racking in a storage facility"
                  width={1200}
                  height={800}
                  quality={70}
                  sizes="(max-width: 1023px) 100vw, 340px"
                  className="block h-[200px] w-full object-cover [filter:grayscale(.6)_contrast(1.05)_brightness(.9)]"
                />
              </figure>
              <div className="mt-2.5 font-mono text-[11px] uppercase tracking-[.1em] text-ink-muted">
                Typical client · 38–217 employees
              </div>
            </div>
            <div className="flex flex-col">
              {PROBLEMS.map((p) => (
                <div
                  key={p.n}
                  className="grid grid-cols-[44px_1fr_1fr] [&>*]:min-w-0 items-start gap-8 border-t border-line py-[26px] max-md:grid-cols-1 max-md:gap-3.5"
                >
                  <div className="font-mono text-[13px] text-danger">{p.n}</div>
                  <div>
                    <h3 className="font-display text-[19px] font-semibold">
                      {p.title}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-normal text-ink-soft [text-wrap:pretty]">
                      {p.body}
                    </p>
                  </div>
                  <div className="border-l border-line pl-6 max-md:border-l-0 max-md:border-t max-md:pl-0 max-md:pt-3.5">
                    <div className="font-mono text-[22px] font-medium tracking-[-.02em]">
                      {p.stat}
                    </div>
                    <div className="mt-[7px] text-[13px] leading-snug text-ink-muted">
                      {p.statNote}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" data-reveal className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-10 pb-[88px] pt-20 max-sm:px-5">
          <div className="grid grid-cols-[1fr_380px] [&>*]:min-w-0 items-end gap-12 max-lg:grid-cols-1 max-lg:gap-6">
            <div>
              <div className="pv-label !text-[11.5px]">How it works</div>
              <h2 className="mt-4 font-display text-[clamp(27px,3.6vw,36px)] font-semibold leading-[1.06] tracking-[-.025em]">
                Six steps. Nothing you have to look up.
              </h2>
            </div>
            <p className="max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">
              Ranges are fine everywhere. Each answered step commits a row to
              your record, and your progress is saved as you go.
            </p>
          </div>
          <div data-stagger className="mt-10 grid grid-cols-3 gap-px border border-line bg-line max-lg:grid-cols-2 max-sm:grid-cols-1">
            {FLOW_STEPS.map((s) => (
              <div
                key={s.n}
                className="bg-raised px-[26px] pb-7 pt-[26px] transition-colors duration-150 hover:bg-tint"
              >
                <div className="font-mono text-xs tracking-[.08em] text-accent">
                  STEP {s.n}
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold tracking-[-.01em]">
                  {s.title}
                </h3>
                <p className="mt-[9px] text-[14.5px] leading-normal text-ink-soft [text-wrap:pretty]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/discovery"
              className="rounded-md bg-accent px-6 py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
            >
              Start step 1
            </Link>
            <span className="text-sm text-ink-muted">No account needed to begin.</span>
          </div>
        </div>
      </section>

      {/* TWO WAYS TO START · restored from the original site */}
      <section id="renewals" className="border-b border-line bg-tint py-[84px] max-sm:py-14">
        <div className="mx-auto max-w-[1240px] px-10 max-sm:px-5">
          <div className="pv-label">Two ways to start</div>
          <h2 className="mt-3.5 max-w-[20ch] font-display text-[clamp(27px,3.5vw,40px)] font-semibold leading-[1.08] tracking-[-.025em]">
            Shop fresh, or let us benchmark what you have.
          </h2>
          <div className="mt-9 grid grid-cols-2 gap-5 max-lg:grid-cols-1">
            {[
              {
                eyebrow: "Start shopping",
                title: "Find your best-fit platform",
                body: "Run a quick, guided discovery and get matched against the market. Ideal if you are evaluating options, switching, or buying for the first time.",
                cta: "Start shopping",
                href: "/discovery",
                primary: true,
              },
              {
                eyebrow: "Already have a quote?",
                title: "Renewing? We will benchmark your deal",
                body: "Renewing or holding a competing bid? Run the same discovery and tell us who you are with. Our team benchmarks your current terms against the market and shops your options, so you know if you are getting a fair deal. Your advisor will ask for the paperwork if seeing it would help.",
                cta: "Benchmark my renewal",
                href: "/discovery?intent=renewal",
                primary: false,
              },
            ].map((c) => (
              <div
                key={c.eyebrow}
                data-reveal
                className="flex flex-col rounded-md border border-line bg-raised p-8 max-sm:p-6"
              >
                <div className="pv-label">{c.eyebrow}</div>
                <h3 className="mt-3 font-display text-[21px] font-semibold leading-snug tracking-[-.015em]">
                  {c.title}
                </h3>
                <p className="mt-3 flex-1 text-[15.5px] leading-relaxed text-ink-soft">
                  {c.body}
                </p>
                <Link
                  href={c.href}
                  className={
                    c.primary
                      ? "mt-7 inline-flex w-fit rounded-md bg-accent px-[22px] py-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
                      : "mt-7 inline-flex w-fit rounded-md border border-line-strong px-[22px] py-3 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
                  }
                >
                  {c.cta} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE COMPARE */}
      <section id="compare" data-reveal className="border-t border-line bg-dark text-dark-ink">
        <div className="mx-auto max-w-[1240px] px-10 pb-[88px] pt-20 max-sm:px-5">
          <div className="grid grid-cols-[1fr_360px] [&>*]:min-w-0 items-end gap-12 max-lg:grid-cols-1 max-lg:gap-6">
            <div>
              <div className="font-mono text-[11.5px] uppercase tracking-[.14em] text-dark-ink-muted">
                The landscape
              </div>
              <h2 className="mt-4 font-display text-[clamp(27px,3.6vw,36px)] font-semibold leading-[1.06] tracking-[-.025em] text-dark-ink-bright">
                Five models, priced on five different bases.
              </h2>
            </div>
            <p className="max-w-[36ch] text-[15px] leading-relaxed text-dark-ink-muted">
              We hold agreements across the market and quote your record against
              every model that fits it. Provider names appear once you are in
              the flow.
            </p>
          </div>
          <div data-sequence className="mt-10 border border-dark-line">
            <div className="grid grid-cols-[1.1fr_1fr_1fr_1.2fr_92px] gap-6 [&>*]:min-w-0 border-b border-dark-line bg-dark-raised px-6 py-3.5 font-mono text-[11px] uppercase tracking-[.11em] text-dark-ink-muted max-md:hidden">
              <div>Model</div>
              <div>Typical fit</div>
              <div>Pricing basis</div>
              <div>Where it breaks</div>
              <div className="text-right">Quotes</div>
            </div>
            {MODELS.map((m) => (
              <div
                key={m.name}
                className="grid grid-cols-[1.1fr_1fr_1fr_1.2fr_92px] items-baseline gap-6 [&>*]:min-w-0 border-b border-dark-line-soft px-6 py-[19px] transition-colors duration-150 last:border-b-0 hover:bg-dark-raised max-md:grid-cols-1 max-md:gap-[11px] max-md:px-[18px] max-md:py-5"
              >
                <div className="font-display text-[16.5px] font-semibold text-dark-ink-bright">
                  {m.name}
                </div>
                <MRow label="Typical fit">
                  <span className="font-mono text-[13.5px] text-dark-ink-soft">{m.fit}</span>
                </MRow>
                <MRow label="Pricing basis">
                  <span className="text-sm text-dark-ink-soft">{m.basis}</span>
                </MRow>
                <MRow label="Where it breaks">
                  <span className="text-sm leading-snug text-dark-ink-muted">{m.breaks}</span>
                </MRow>
                <MRow label="Quotes" right>
                  <span className="font-mono text-sm text-positive-bright">{m.quotes}</span>
                </MRow>
              </div>
            ))}
          </div>
          <div className="mt-5 font-mono text-xs text-ink-faint">
            Quote counts reflect active agreements as of 2026-08-01.
          </div>
        </div>
      </section>

      {/* PHOTO BAND · open-licence photography (Unsplash licence, credited in footer) */}
      <section data-reveal className="relative border-t border-line">
        <figure className="relative m-0 h-[clamp(220px,32vw,380px)] overflow-hidden bg-dark">
          <Image
            src="/photography/warehouse-aisle.jpg"
            alt="Two workers walking an aisle of racking in a distribution warehouse"
            fill
            sizes="100vw"
            quality={70}
            className="object-cover [filter:grayscale(.55)_contrast(1.04)_brightness(.86)]"
          />
          <figcaption
            className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-5 px-10 pb-6 pt-[26px] max-sm:px-5"
            style={{
              background:
                "linear-gradient(to top,rgba(25,35,59,.82),rgba(25,35,59,0))",
            }}
          >
            <div className="max-w-[22ch] font-display text-[clamp(19px,2.4vw,26px)] font-semibold leading-[1.15] tracking-[-.02em] text-dark-ink-bright [text-wrap:balance]">
              142 employees across four states. Three incompatible quotes.
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[.12em] text-dark-ink-muted">
              Ref 4821 · placed 2026-02-11
            </div>
          </figcaption>
        </figure>
      </section>

      {/* WHO THIS IS FOR */}
      <section data-reveal className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-10 pb-[84px] pt-20 max-sm:px-5">
          <div className="pv-label !text-[11.5px]">Who this is for</div>
          <h2 className="mt-4 max-w-[22ch] font-display text-[clamp(27px,3.6vw,36px)] font-semibold leading-[1.06] tracking-[-.025em]">
            Headcount decides which models are even available to you.
          </h2>
          <div data-stagger className="mt-10 grid grid-cols-4 gap-px border border-line bg-line max-lg:grid-cols-2 max-sm:grid-cols-1">
            {SEGMENTS.map((g) => (
              <div
                key={g.range}
                data-highlight={g.highlight ? "true" : undefined}
                className="group/seg bg-raised px-6 pb-7 pt-[26px] data-[highlight]:bg-[var(--pv-tone-accent-bg)]"
              >
                <div className="font-mono text-2xl font-medium tracking-[-.02em] text-ink group-data-[highlight]/seg:text-accent">
                  {g.range}
                </div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-[.13em] text-ink-muted">
                  employees
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{g.title}</h3>
                <p className="mt-[9px] text-[14.5px] leading-normal text-ink-soft [text-wrap:pretty]">
                  {g.body}
                </p>
                <div className="mt-[18px] border-t border-line pt-3.5 text-[13px] leading-snug text-ink-muted">
                  {g.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROOF · hidden until the client supplies real references. See
          lib/content/proof.ts: the current content is invented. */}
      {PROOF_READY && (
      <section data-reveal className="border-t border-line bg-tint">
        <div className="mx-auto max-w-[1240px] px-10 pb-[84px] pt-[78px] max-sm:px-5">
          <div className="grid grid-cols-3 gap-px border border-line bg-line max-sm:grid-cols-1">
            {OUTCOMES.map((o) => (
              <div key={o.figure} className="bg-raised px-[26px] pb-7 pt-[26px]">
                <div className="font-mono text-[34px] font-medium tracking-[-.025em]">
                  {o.figure}
                </div>
                <div className="mt-2.5 text-[14.5px] leading-normal text-ink-soft">
                  {o.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-6 max-lg:grid-cols-1">
            {QUOTES.map((q) => (
              <blockquote
                key={q.initials}
                className="m-0 flex flex-col justify-between gap-[22px] rounded-md border border-line bg-raised p-[26px]"
              >
                <p className="text-base leading-normal [text-wrap:pretty]">{q.text}</p>
                <footer className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-sunken font-mono text-[11px] text-ink-muted">
                    {q.initials}
                  </div>
                  <div className="text-[13.5px] leading-snug">
                    <div className="font-semibold">{q.name}</div>
                    <div className="text-ink-muted">{q.role}</div>
                  </div>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* FOR BROKERS · partner referral. Copy is a placeholder: the original
          site had a nav link with little behind it, so this needs client copy. */}
      <section id="brokers" className="border-b border-line bg-dark py-[76px] max-sm:py-14">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.1fr_1fr] [&>*]:min-w-0 items-center gap-14 px-10 max-lg:grid-cols-1 max-lg:gap-8 max-sm:px-5">
          <div>
            <div className="pv-label text-dark-ink-muted">For brokers</div>
            <h2 className="mt-3.5 max-w-[22ch] font-display text-[clamp(26px,3.2vw,36px)] font-semibold leading-[1.1] tracking-[-.025em] text-dark-ink-bright">
              Refer a client, keep the relationship.
            </h2>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-dark-ink-soft">
              We work alongside brokers, accountants, and fractional HR teams
              who would rather not run a PEO search themselves. You bring the
              relationship, we run the discovery and the market comparison, and
              your client sees the whole shortlist.
            </p>
          </div>
          <div className="rounded-md border border-dark-line bg-dark-raised p-7">
            <div className="text-[15px] leading-relaxed text-dark-ink-soft">
              Partner enquiries go straight to the brokerage team.
            </div>
            <a
              href="mailto:hello@primepeobrokers.com?subject=Partner%20enquiry"
              className="mt-5 inline-flex rounded-md bg-accent px-[22px] py-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
            >
              Talk to us about partnering
            </a>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section id="trust" data-reveal className="border-t border-line">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[360px_1fr] [&>*]:min-w-0 items-start gap-16 px-10 pb-[84px] pt-[78px] max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-5">
          <div>
            <div className="pv-label !text-[11.5px]">Data handling</div>
            <h2 className="mt-4 font-display text-[clamp(25px,3.2vw,32px)] font-semibold leading-[1.08] tracking-[-.022em]">
              You are handing over headcount and pay data. Here is where it goes.
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-px border border-line bg-line max-md:grid-cols-1">
            {TRUST.map((t) => (
              <div key={t.tag} className="bg-raised px-[26px] pb-[26px] pt-6">
                <div className="font-mono text-[11px] uppercase tracking-[.13em] text-positive-deep">
                  {t.tag}
                </div>
                <h3 className="mt-3 font-display text-[17.5px] font-semibold">
                  {t.title}
                </h3>
                <p className="mt-[9px] text-[14.5px] leading-normal text-ink-soft [text-wrap:pretty]">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" data-reveal className="border-t border-line bg-tint">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[340px_1fr] [&>*]:min-w-0 items-start gap-16 px-10 pb-[88px] pt-[78px] max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-5">
          <div>
            <div className="pv-label !text-[11.5px]">FAQ</div>
            <h2 className="mt-4 font-display text-[clamp(25px,3.2vw,32px)] font-semibold leading-[1.08] tracking-[-.022em]">
              Questions people actually ask.
            </h2>
            <p className="mt-[18px] text-[14.5px] leading-relaxed text-ink-soft">
              Anything else, email{" "}
              <a
                href="mailto:hello@primepeobrokers.com"
                className="border-b border-[color-mix(in oklab,var(--pv-accent) 30%,transparent)] text-accent hover:border-accent-press hover:text-accent-press"
              >
                hello@primepeobrokers.com
              </a>
              .
            </p>
          </div>
          <Faq items={FAQS} />
        </div>
      </section>

      {/* CLOSING CTA */}
      <section data-reveal className="border-t border-line bg-dark text-dark-ink">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.1fr_1fr] [&>*]:min-w-0 items-center gap-[72px] px-10 pb-[92px] pt-[88px] max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-5">
          <div>
            <h2 className="font-display text-[clamp(30px,4.6vw,44px)] font-semibold leading-[1.03] tracking-[-.03em] text-dark-ink-bright [text-wrap:balance]">
              Six steps, and you will know what you should be paying.
            </h2>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-normal text-dark-ink-muted">
              Start now, or start the parts you know and finish later from the
              link we email you. Nothing is shared with a provider until you say
              so.
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <Link
                href="/discovery"
                className="rounded-md bg-dark-ink px-[26px] py-[15px] text-base font-semibold text-ink transition-colors duration-150 hover:bg-white"
              >
                Start shopping
              </Link>
              <a
                href="mailto:hello@primepeobrokers.com?subject=Talk%20to%20a%20broker"
                className="rounded-md border border-ink-soft px-6 py-[15px] text-base font-semibold text-dark-ink transition-colors duration-150 hover:border-dark-ink-muted"
              >
                Talk to a broker first
              </a>
            </div>
          </div>
          <div data-sequence className="rounded-md border border-dark-line">
            {[
              ["Now", "You pick a category and answer five short steps. Each one is saved as you go."],
              ["< 1 day", "A broker reads the record and confirms which providers fit it."],
              ["3–5 days", "A written comparison, one axis, with the assumptions stated."],
            ].map(([when, what]) => (
              <div
                key={when}
                className="grid grid-cols-[52px_1fr] [&>*]:min-w-0 items-start gap-[18px] border-b border-dark-line-soft px-[22px] py-5 last:border-b-0"
              >
                <div className="font-mono text-xs text-positive-bright">{when}</div>
                <div className="text-[14.5px] leading-normal text-dark-ink-soft">
                  {what}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-dark-line-soft bg-dark text-ink-faint">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.4fr_1fr_1fr_1fr] [&>*]:min-w-0 gap-12 px-10 pb-11 pt-[52px] max-lg:grid-cols-2 max-lg:gap-9 max-sm:grid-cols-1 max-sm:px-5">
          <div>
            <div className="flex items-center">
              <Logo size={32} variant="inverted" />
            </div>
            <p className="mt-4 max-w-[34ch] text-[13.5px] leading-relaxed">
              Licensed insurance and PEO brokerage. We are paid by the provider
              you select, never by you.
            </p>
            <div className="mt-[18px] font-mono text-[10.5px] text-ink-muted">
              Photography: Adrian Sulyok, Lance Chang, Unsplash licence · Hero
              footage: Pressmaster, Pexels licence
            </div>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.head}>
              <div className="font-mono text-[11px] uppercase tracking-[.13em] text-dark-ink">
                {col.head}
              </div>
              <div className="mt-4 flex flex-col gap-[11px]">
                {col.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    className="text-sm text-dark-ink-muted transition-colors duration-150 hover:text-dark-ink"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-6 border-t border-dark-line-soft px-10 pb-12 pt-5 font-mono text-[11.5px] max-sm:px-5">
          <div>© 2026 Prime PEO Brokers</div>
          <div className="flex gap-6">
            <Link href="/#trust" className="text-ink-faint hover:text-dark-ink">Privacy</Link>
            <Link href="/#trust" className="text-ink-faint hover:text-dark-ink">Terms</Link>
            <Link href="/privacy" className="text-ink-faint hover:text-dark-ink">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Mobile-labelled cell for the dark comparison table. */
function MRow({
  label,
  right,
  children,
}: {
  label: string;
  right?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${right ? "text-right max-md:text-left" : ""} max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-[18px]`}
    >
      <span className="hidden pt-[3px] font-mono text-[10.5px] uppercase tracking-[.11em] text-ink-faint max-md:block">
        {label}
      </span>
      {children}
    </div>
  );
}
