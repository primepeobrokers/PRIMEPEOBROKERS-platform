/**
 * The marketing page, rendered for the house site and for every partner.
 *
 * WHY THIS IS A COMPONENT AND NOT JUST app/page.tsx
 *
 * A partner subdomain needs this same page in their brand. Duplicating it
 * would guarantee drift, which this page has already suffered once: the hero
 * copy and the meta description were byte-identical twins and had to be kept
 * in step by hand.
 *
 * So the sections live here and take a tenant, and the two routes are thin:
 *
 *   app/page.tsx                  tenant={null}, statically prerendered
 *   app/partner-home/page.tsx     the resolved tenant, dynamic
 *
 * app/page.tsx MUST NOT become tenant-aware. getTenant() reads headers(),
 * which would turn the house marketing page dynamic and cost it its TTFB and
 * its prerender. Passing null here is what keeps it static: this file reads
 * no headers and fetches no data.
 */

import Image from "next/image";
import Link from "next/link";
import { Logo, TenantMark } from "@/app/components/logo";
import { RevealInit } from "@/app/components/reveal";
import { Faq } from "@/app/components/faq";
import { PROOF_READY, OUTCOMES, QUOTES } from "@/lib/content/proof";
import { STEPS } from "@/lib/discovery/schema";
import type { Branding } from "@/lib/tenant/branding";

/** The tenant whose brand this page wears. null means the house site. */
export type LandingTenant = {
  isHouse: boolean;
  name: string;
  branding: Branding;
} | null;

/**
 * The house identity, named once.
 *
 * These stay on a partner's page in exactly two places, both deliberate: the
 * legal links in the footer, and the line naming who is licensed and who is
 * paid. Terms and privacy name Prime because Prime is the data controller and
 * holds the brokerage licence, so a partner's visitor must be able to see
 * whose terms they are agreeing to.
 */
export const HOUSE_NAME = "Prime PEO Brokers";
export const HOUSE_EMAIL = "admin@primepeobrokers.com";

/**
 * What the page says, per tenant.
 *
 * Pure and exported so the white-label rules are unit-testable without
 * rendering React: the cost of getting one of these wrong is Prime's inbox or
 * Prime's licensing claim appearing on a partner's own domain.
 */
export function landingBrand(tenant: LandingTenant) {
  const isPartner = tenant !== null && !tenant.isHouse;
  return {
    isPartner,
    brandName: isPartner
      ? (tenant.branding.companyName ?? tenant.name)
      : HOUSE_NAME,
    /*
      Falls back to Prime's inbox rather than rendering a dead mailto: a
      partner whose branding carries no supportEmail still gets a working
      contact link, and Prime's team works these leads either way.
    */
    contactEmail: isPartner
      ? (tenant.branding.supportEmail ?? HOUSE_EMAIL)
      : HOUSE_EMAIL,
    /*
      The referral section pitches becoming a partner OF PRIME. On a partner's
      own site that is off-message, so it comes out, and with it the nav and
      footer links that would otherwise dangle at #brokers.
    */
    showPartnerSection: !isPartner,
  };
}

/*
  The sample record behind the hero card.

  Trimmed from seven rows to four. The old card listed every field the
  discovery form collects, each on its own bordered row in monospace, which
  made a form printout rather than a result: seven equal rows, no hierarchy,
  and the one number a visitor actually cares about sat at the bottom in the
  same weight as "Contractors (1099)".

  What survives is what makes the figure credible: the size of the company,
  what they spend now, and when they can act. Renewal date and 1099 count are
  detail the discovery form asks for, not detail that sells the outcome.
*/
const LEDGER = [
  { label: "Company size", value: "38 employees", delay: "300ms" },
  { label: "Sector", value: "Technology", delay: "350ms" },
  { label: "PEOs marketed", value: "6", delay: "400ms" },
];

const PROBLEMS = [
  {
    n: "01",
    title: "Pricing you cannot compare",
    body: "One provider quotes per employee per month, the next quotes a percentage of payroll, the third bundles admin into the benefits load. The same company gets three numbers that do not sit on the same axis.",
  },
  {
    n: "02",
    title: "Mismatched to your stage",
    body: "A 30-person company gets sold the enterprise service model. A 200-person company gets a platform built for 15. Providers rarely disqualify themselves.",
  },
  {
    n: "03",
    title: "Renewal traps",
    body: "Rate increases land 45 days before renewal, past the window to run a real comparison. Termination clauses and payroll cutovers do the rest.",
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
    body: "Headcounts, who runs payroll today, and what you pay your current provider. Estimates are fine.",
  },
  {
    n: "4",
    title: STEPS[3].title,
    body: "Time tracking, the HR support you need, and what you offer today. Totals, never individual salaries.",
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
    basis: "% of payroll, per employee per month, or per check",
  },
  {
    name: "ASO (Managed HR)",
    fit: "25–250",
    basis: "Per employee, per month",
  },
  {
    name: "Payroll Only (Plus Light HR)",
    fit: "5–150",
    basis: "Per employee, per month",
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
    body: "Your assigned advisor and their team. Access is authenticated and scoped at the data layer, not just the interface.",
  },
  {
    tag: "Retention",
    title: "Deleted on request, in 30 days",
    body: "Ask and we delete the record and the partial drafts within 30 days. Records for clients we place are retained as long as required by law.",
  },
];

const FAQS = [
  {
    q: "Is this actually free?",
    a: "Yes. There is no fee to you. Advisory compensation is paid by the provider you select, and only if you select one.",
  },
  {
    q: "Why do you need headcount and compensation ranges?",
    a: "Because every model in this market is priced off them. Without headcount, worker classification, and a benefits spend range, a quote is a guess. Ranges are acceptable everywhere in the flow.",
  },
  {
    q: "Do providers see my submission?",
    a: "Not until you approve it. Your advisor reviews the record first and tells you which providers they intend to quote. You confirm the list.",
  },
  {
    q: "What happens after I submit?",
    a: "An advisor reads your record within one business day and sends a written comparison of the models that fit. If something in your record is ambiguous, they ask before quoting.",
  },
  {
    q: "Can I stop halfway?",
    a: "Yes. Each answered step is saved. We email you a link that returns you to the step you left, and the partial record stays private to your advisor.",
  },
  {
    q: "Does this affect my current advisors or providers?",
    a: "Nothing changes unless you decide to move forward. Your current advisors are welcome to be part of the review, and we will show you exactly how any option would affect your existing benefits and insurance.",
  },
  {
    q: "Do you work outside the US?",
    a: "No. US-domiciled employers only. For overseas headcount we can point you to an EOR, which is outside what we advise on.",
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
      { label: "For partners", href: "/#brokers" },
    ],
  },
  {
    head: "Company",
    links: [
      { label: "About", href: "/#how" },
      // Rewritten per tenant in the component: a partner's visitor must reach
      // the partner, not Prime's inbox.
      { label: "Contact", href: `mailto:${HOUSE_EMAIL}` },
      { label: "Renewals", href: "/#renewals" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    head: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms and conditions", href: "/terms" },
      { label: "Data handling", href: "/#trust" },
      { label: "Do not sell my data", href: "/privacy#resale" },
    ],
  },
];

export function LandingSections({ tenant }: { tenant: LandingTenant }) {
  /*
    `null` (the house route, which resolves no tenant at all) and the house
    tenant itself both render exactly what shipped before.
  */
  const { brandName, contactEmail, showPartnerSection } = landingBrand(tenant);

  // The narrowed tenant, not a boolean: TypeScript cannot carry `isPartner`
  // back to `tenant`, and TenantMark needs a non-null one. Null here means
  // "render the house lockup", which is exactly the house case.
  const partner = tenant !== null && !tenant.isHouse ? tenant : null;

  const footerCols = FOOTER_COLS.map((col) => ({
    ...col,
    links: col.links
      .filter((l) => showPartnerSection || l.href !== "/#brokers")
      .map((l) =>
        l.href.startsWith("mailto:")
          ? { ...l, href: `mailto:${contactEmail}` }
          : l,
      ),
  }));

  return (
    <div className="bg-surface">
      <RevealInit />

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-line bg-[rgba(255,255,255,.92)] backdrop-blur-[8px]">
        {/*
          gap-6 until xl, not gap-8 everywhere.

          The nav appears at lg (1024px) and at exactly that width the row
          measured 13px too wide, so "Sign in" and "Start shopping" were
          clipped at the right edge. The links fit and the buttons did not,
          which is the worst version of the failure: the page looks fine
          until you try to click the thing it wants you to click. Tightening
          the row gap and the nav's own spacing between lg and xl buys the
          room back without touching the comfortable wide layout.
        */}
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-6 px-10 xl:gap-8 max-sm:gap-3 max-sm:px-5">
          <Link href="/" className="flex items-center" aria-label={`${brandName} home`}>
            {/*
              TenantMark falls back to the house lockup for the house tenant
              and to a typographic wordmark for a partner with no uploaded
              logo, so a partner is never blocked on supplying artwork. The
              Prime cube stays unreachable for partners by design: it is traced
              from this client's brand guide and is their trademark.
            */}
            {partner ? <TenantMark tenant={partner} size={34} /> : <Logo size={34} />}
          </Link>
          {/*
            Hidden below lg, not below md.

            The links appeared at md (768px) but do not FIT until about
            900px: logo + six links + two buttons + gap-8 + px-10 measured
            868px of content in a 768px viewport, so the header overflowed by
            100px and the whole page scrolled sideways on a tablet. Held back
            to lg (1024px), which is the first width where the row has room.
            e2e/layout-overflow.spec.ts asserts this at 768px.
          */}
          <nav
            aria-label="Primary"
            className="flex items-center gap-5 text-[14.5px] xl:gap-[30px] max-lg:hidden"
          >
            <a href="#how" className="text-ink-soft hover:text-accent-press">How it works</a>
            <a href="#compare" className="text-ink-soft hover:text-accent-press">What we compare</a>
            <a href="#renewals" className="text-ink-soft hover:text-accent-press">Renewals</a>
            {showPartnerSection && (
              <a href="#brokers" className="text-ink-soft hover:text-accent-press">For partners</a>
            )}
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

      {/*
        HERO · animated backdrop of open-licence footage (Pexels licence).

        WHY THIS IS NOT THE UHD FILE, AND WHY IT DOES NOT PRELOAD

        It used to load the 2560x1440 master with preload="auto": 11.1MB
        fetched on every homepage visit, from a third-party origin, competing
        with the HTML, CSS, fonts and hero image for bandwidth. That was about
        60x the page's entire gzipped JavaScript.

        None of that resolution survives. The clip renders under
        grayscale(1) brightness(.5), a 55% orange mix-blend layer and a
        scanline overlay, at whatever size the hero happens to be. The 640x360
        variant is visually indistinguishable through that stack and is 1.3MB,
        an 88% saving.

        preload="none" so the poster paints first and the video is fetched
        only once the browser is idle enough to start it: the poster is a
        56KB JPEG that already carries the composition. On a slow connection
        the hero now shows the poster instead of a black box, and on a metered
        one the visitor is not charged 11MB for a background texture.

        prefers-reduced-motion is honoured below, where the video is skipped
        entirely and the poster is used as a plain background.
      */}
      <section className="relative overflow-hidden bg-dark">
        <div aria-hidden className="absolute inset-0 overflow-hidden bg-dark">
          {/*
            The poster as its own layer, beneath the video.

            It is a sibling rather than a background on the wrapper because a
            CSS filter creates a containing block and would re-filter every
            overlay stacked above it, double-darkening the orange wash. Same
            filter as the video, so the reduced-motion case (video hidden)
            and the not-yet-loaded case both look like the animated version
            rather than a brighter still.
          */}
          <div
            className="absolute inset-0 bg-[url('/photography/hero-poster.jpg')] bg-cover bg-center [filter:grayscale(1)_contrast(1.22)_brightness(.5)]"
          />
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster="/photography/hero-poster.jpg"
            className="absolute inset-0 h-full w-full object-cover [filter:grayscale(1)_contrast(1.22)_brightness(.5)] motion-reduce:hidden"
          >
            <source
              src="https://videos.pexels.com/video-files/3254006/3254006-sd_640_360_25fps.mp4"
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
            software for free. Answer a structured set of questions once; an
            expert on our team does the legwork and delivers your tailored
            proposal. One advisor, every option. You never pay a fee.
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
            Free to start · Save and finish later · Renewing? We will
            benchmark your deal
          </div>
          <div
            className="mt-9 flex gap-[34px] border-t border-dark-line pt-[26px] max-sm:flex-wrap max-sm:gap-[22px]"
            style={{ animation: "pv-in 500ms var(--pv-ease) 200ms both" }}
          >
            {[
              ["6 min", "Median time to complete"],
              ["1 business day", "Your advisor reviews your submission within"],
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

        {/*
          THE RESULT, NOT THE FORM.

          This was a seven-row ledger: every discovery field on its own
          bordered line, values in monospace, the savings figure last and in
          the same weight as everything above it. It read as a spreadsheet
          export, which is what the client meant by dated. The structure was
          the problem, not the styling: equal rows give equal emphasis, so
          nothing led.

          Now the figure leads and the facts support it. One number at display
          size, the four details that make it credible underneath as quiet
          pairs, and the chrome reduced to a single soft-edged surface. No
          inner dividers, no monospace on the values (it was signalling
          "technical" rather than carrying data), and a lighter shadow that
          lifts the card off the navy without the heavy border it had.
        */}
        <div
          className="overflow-hidden rounded-xl border border-[rgba(255,255,255,.1)] bg-raised shadow-[0_2px_4px_rgba(10,16,30,.08),0_24px_60px_-28px_rgba(10,16,30,.5)]"
          style={{ animation: "pv-in 500ms var(--pv-ease) 120ms both" }}
        >
          {/*
            The headline figure. Kept on a tinted ground so the card has a
            clear focal band, but the tint is a wash rather than the boxed
            "alert" strip it replaced.
          */}
          <div
            className="border-b border-line bg-[color-mix(in_oklab,var(--pv-accent)_4%,transparent)] px-7 pb-7 pt-[26px]"
            style={{ animation: "pv-row 420ms var(--pv-ease) 220ms both" }}
          >
            {/*
              "Saved", not "delta", and no minus sign. Both changed on the
              client's instruction (update list item 5, 2026-09-29).

              The distinction still matters and is worth keeping written down:
              a delta is the difference between two models and is neutral
              about direction, whereas a saving asserts one. The card used to
              show a modelled comparison, so it could only claim a delta. It
              now shows a real placement, which did save the money, so the
              stronger word is the accurate one rather than a louder one.

              The client confirmed on 2026-10-01 that $170,000 is annual, and
              on 2026-10-05 asked for the label to name the client rather than
              the period: "Last client we helped saved $170,000 annually". A
              savings figure that reads as yearly but is actually cumulative is
              the kind of claim that causes trouble later, which is why it was
              left vague until confirmed.
            */}
            <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-ink-soft">
              Last client we helped saved
            </div>
            {/*
              The one number the page is selling. Display face, not mono:
              this is a headline, and mono at 52px reads as a terminal.
              tabular-nums keeps the digits on a grid so it stays typeset
              rather than merely large.
            */}
            {/*
              "annually" rides with the figure rather than sitting in the line
              below, so the label and the number read as one sentence: "Last
              client we helped saved $170,000 annually." Set smaller than the
              figure and in the body face, because it is the unit on the
              number, not a second headline competing with it.
            */}
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5">
              <span className="font-display text-[clamp(38px,4.6vw,52px)] font-semibold leading-[1] tracking-[-.035em] text-accent [font-variant-numeric:tabular-nums]">
                $170,000
              </span>
              <span className="font-display text-[clamp(17px,1.7vw,20px)] font-semibold leading-[1.1] tracking-[-.015em] text-accent">
                annually
              </span>
            </div>
            <div className="mt-2.5 text-[13.5px] leading-snug text-ink-soft">
              Annual savings, across admin, medical, and workers&rsquo; comp.
            </div>
          </div>

          {/*
            Supporting facts as label-over-value pairs in a two-column grid,
            not as full-width rows with a rule between each. A pair reads as
            one unit at a glance; a row with a hairline under it reads as a
            line item in a table, which is the look being replaced.
          */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-[18px] px-7 py-[26px]">
            {LEDGER.map((r) => (
              <div
                key={r.label}
                className="min-w-0"
                style={{ animation: `pv-row 420ms var(--pv-ease) ${r.delay} both` }}
              >
                {/* ink-muted, not ink-faint: 3.65:1 fails AA even for a
                    label, and these name the figures beside them. */}
                <div className="font-mono text-[10.5px] uppercase tracking-[.1em] text-ink-muted">
                  {r.label}
                </div>
                <div className="mt-[5px] truncate text-[15px] font-medium text-ink [font-variant-numeric:tabular-nums]">
                  {r.value}
                </div>
              </div>
            ))}
          </div>

          {/*
            The provenance line. It names what the card is (a real worked
            example, not a mock) which is the credibility the old
            "DISCOVERY RECORD · DRAFT" header was reaching for, without
            dressing the card as a database row.
          */}
          <div
            className="flex items-center gap-2.5 border-t border-line bg-sunken px-7 py-[15px]"
            style={{ animation: "pv-row 420ms var(--pv-ease) 500ms both" }}
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-positive"
            />
            <span className="text-[12.5px] leading-snug text-ink-muted">
              A real placement. Yours takes about six minutes to start.
            </span>
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
              /*
                ink-muted, not ink-faint. These are the platform names the
                page compares, which is content a reader is meant to read,
                and ink-faint measures 3.65:1 on white: under the 4.5:1 floor
                for normal text. ink-muted is 5.48:1 and keeps the quiet
                treatment the row wants.
              */
              <span
                key={name}
                className="font-display text-[15px] font-semibold tracking-[-.01em] text-ink-muted"
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
              <div className="pv-label !text-[11.5px]">Why shopping alone is hard</div>
              <h2 className="mt-4 font-display text-[clamp(27px,3.6vw,36px)] font-semibold leading-[1.06] tracking-[-.025em] [text-wrap:balance]">
                Why comparing PEOs on your own is hard.
              </h2>
              <figure className="mb-0 ml-0 mr-0 mt-[26px] overflow-hidden border border-line bg-dark">
                <Image
                  src="/photography/advisors.jpg"
                  alt="Two colleagues reviewing figures together at a desk"
                  width={1200}
                  height={800}
                  quality={70}
                  sizes="(max-width: 1023px) 100vw, 340px"
                  className="block h-[200px] w-full object-cover [filter:grayscale(.6)_contrast(1.05)_brightness(.9)]"
                />
              </figure>
            </div>
            <div className="flex flex-col">
              {PROBLEMS.map((p) => (
                <div
                  key={p.n}
                  className="grid grid-cols-[44px_1fr] [&>*]:min-w-0 items-start gap-8 border-t border-line py-[26px] max-md:grid-cols-1 max-md:gap-3.5"
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
                {/* accent-press: 12px is normal text, and raw accent is
                    3.73:1 on white. See AGENTS.md on where orange is usable. */}
                <div className="font-mono text-xs tracking-[.08em] text-accent-press">
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
          <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed text-ink-soft [text-wrap:pretty]">
            We compare every option&rsquo;s total cost against what you pay
            today, including admin fees, benefits, workers&rsquo; comp, and
            payroll taxes.
          </p>
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
                Three models, compared side by side.
              </h2>
            </div>
            <p className="max-w-[36ch] text-[15px] leading-relaxed text-dark-ink-muted">
              We hold agreements across the market and quote your record against
              every model that fits it. Provider names appear once you are in
              the flow.
            </p>
          </div>
          <div data-sequence className="mt-10 border border-dark-line">
            <div className="grid grid-cols-[1fr_120px_1.5fr] gap-6 [&>*]:min-w-0 border-b border-dark-line bg-dark-raised px-6 py-3.5 font-mono text-[11px] uppercase tracking-[.11em] text-dark-ink-muted max-md:hidden">
              <div>Model</div>
              <div>Typical fit</div>
              <div>Pricing basis</div>
            </div>
            {MODELS.map((m) => (
              <div
                key={m.name}
                className="grid grid-cols-[1fr_120px_1.5fr] items-baseline gap-6 [&>*]:min-w-0 border-b border-dark-line-soft px-6 py-[19px] transition-colors duration-150 last:border-b-0 hover:bg-dark-raised max-md:grid-cols-1 max-md:gap-[11px] max-md:px-[18px] max-md:py-5"
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PHOTO BAND · open-licence photography (Unsplash licence, credited in footer) */}
      <section data-reveal className="relative border-t border-line">
        <figure className="relative m-0 h-[clamp(220px,32vw,380px)] overflow-hidden bg-dark">
          <Image
            src="/photography/team-meeting.jpg"
            alt="A small team working together around a table"
            fill
            sizes="100vw"
            quality={70}
            className="object-cover [filter:grayscale(.55)_contrast(1.04)_brightness(.86)]"
          />
          <figcaption
            className="absolute inset-x-0 bottom-0 px-10 pb-6 pt-[26px] max-sm:px-5"
            style={{
              background:
                "linear-gradient(to top,rgba(25,35,59,.82),rgba(25,35,59,0))",
            }}
          >
            <div className="max-w-[28ch] font-display text-[clamp(19px,2.4vw,26px)] font-semibold leading-[1.15] tracking-[-.02em] text-dark-ink-bright [text-wrap:balance]">
              A 38-employee technology company saved $170,000 annually across
              admin, medical, and workers&rsquo; comp.
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

      {/* PARTNER REFERRAL. Labelled "For partners" rather than "For brokers":
          the audience is wider than brokers, and partners running this
          white-labelled are often brokers themselves, so naming them as a
          separate audience read wrong. Copy supplied by the client.

          House only. This section recruits partners FOR PRIME, so on a
          partner's own site it would be soliciting their competitors, and the
          mailto below goes to Prime's inbox rather than theirs. The nav and
          footer links to #brokers come out with it. */}
      {showPartnerSection && (
      <section id="brokers" className="border-b border-line bg-dark py-[76px] max-sm:py-14">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.1fr_1fr] [&>*]:min-w-0 items-center gap-14 px-10 max-lg:grid-cols-1 max-lg:gap-8 max-sm:px-5">
          <div>
            {/*
              !text-dark-ink-muted, with the bang.

              This eyebrow sits on the navy referral panel, and .pv-label sets
              its own colour to --pv-ink-muted, a light-ground token. A plain
              utility class loses to the component class on specificity, so
              the override was written but never applied and the label sat at
              2.85:1. The bang is what makes it win.
            */}
            <div className="pv-label !text-dark-ink-muted">For partners</div>
            <h2 className="mt-3.5 max-w-[22ch] font-display text-[clamp(26px,3.2vw,36px)] font-semibold leading-[1.1] tracking-[-.025em] text-dark-ink-bright">
              Refer a client, keep the relationship.
            </h2>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-dark-ink-soft">
              We work alongside many different partners, from financial
              advisors, fractional HR teams, HR consulting firms, and
              accountants who would rather not run a PEO search themselves. You
              bring the relationship, we run the discovery and the market
              comparison, and your client sees the whole shortlist.
            </p>
          </div>
          <div className="rounded-md border border-dark-line bg-dark-raised p-7">
            <div className="text-[15px] leading-relaxed text-dark-ink-soft">
              Partner inquiries go straight to our team.
            </div>
            <a
              href="mailto:admin@primepeobrokers.com?subject=Partner%20inquiry"
              className="mt-5 inline-flex rounded-md bg-accent px-[22px] py-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
            >
              Talk to us about partnering
            </a>
          </div>
        </div>
      </section>
      )}

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
                href={`mailto:${contactEmail}`}
                className="border-b border-[color-mix(in oklab,var(--pv-accent) 30%,transparent)] text-accent-press hover:border-accent hover:text-accent"
              >
                {contactEmail}
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
              {/* Into the flow, not to a call form. The client's instruction
                  was that "Talk to an advisor" is wording, not a different
                  destination: an advisor reads the record either way, and the
                  record is what makes that conversation useful. */}
              <Link
                href="/discovery"
                className="rounded-md border border-ink-soft px-6 py-[15px] text-base font-semibold text-dark-ink transition-colors duration-150 hover:border-dark-ink-muted"
              >
                Talk to an advisor
              </Link>
            </div>
          </div>
          <div data-sequence className="rounded-md border border-dark-line">
            {[
              ["Now", "You pick a category and work through six short steps. Each one is saved as you go."],
              ["1 business day", "An advisor reads the record and confirms which providers fit it."],
              ["3–5 days", "A written comparison, one axis, with the assumptions stated."],
            ].map(([when, what]) => (
              <div
                key={when}
                className="grid grid-cols-[116px_1fr] [&>*]:min-w-0 items-start gap-[18px] border-b border-dark-line-soft px-[22px] py-5 last:border-b-0 max-sm:grid-cols-1 max-sm:gap-1.5"
              >
                <div className="font-mono text-xs leading-snug text-positive-bright">
                  {when}
                </div>
                <div className="text-[14.5px] leading-normal text-dark-ink-soft">
                  {what}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      {/* dark-ink-muted, not ink-faint: the faint token is tuned for light
          grounds and only reaches 4.27:1 on this navy. */}
      <footer className="border-t border-dark-line-soft bg-dark text-dark-ink-muted">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1.4fr_1fr_1fr_1fr] [&>*]:min-w-0 gap-12 px-10 pb-11 pt-[52px] max-lg:grid-cols-2 max-lg:gap-9 max-sm:grid-cols-1 max-sm:px-5">
          <div>
            <div className="flex items-center">
              {partner ? (
                <TenantMark tenant={partner} size={32} variant="inverted" />
              ) : (
                <Logo size={32} variant="inverted" />
              )}
            </div>
            {/*
              One line, identical on every tenant. It names Prime outright, so
              it is already accurate on a partner site: a partner may hold no
              insurance licence at all, and this tells a visitor whose terms
              and privacy policy the links below lead to.
            */}
            {/*
              The trading name, on its own. The client asked for the DBA here
              (2026-10-01) rather than a registered entity, which settles the
              open question about the legal name: there is no "LLC" line to
              add, and "Prime PEO Brokers, DBA" would read as an abbreviation
              hanging off the name rather than as the name itself.
            */}
            <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed">
              PEO and HCM advisory services provided by {HOUSE_NAME}.
            </p>
          </div>
          {footerCols.map((col) => (
            <div key={col.head}>
              <div className="font-mono text-[11px] uppercase tracking-[.13em] text-dark-ink">
                {col.head}
              </div>
              {/*
                Padded to a tappable height, not just spaced.

                These were 20px tall on a 31px pitch. The 44px minimum is not
                a style guide nicety: at that spacing a thumb lands between
                two links as often as on one, and every mis-tap on a footer
                navigates somewhere wrong. Vertical padding on the anchor
                grows the hit area without moving the text, and the negative
                margin on the column keeps the visual rhythm the design had.
              */}
              <div className="mt-2.5 flex flex-col">
                {col.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    className="rounded-sm py-2.5 text-sm text-dark-ink-muted transition-colors duration-150 hover:text-dark-ink"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-6 border-t border-dark-line-soft px-10 pb-12 pt-5 font-mono text-[11.5px] max-sm:px-5">
          <div>© 2026 {brandName}</div>
          {/*
            These pointed at /#trust twice and listed "Privacy" twice, so the
            "Terms" link never reached the terms page on any site. The legal
            pages stay Prime's on a partner host: Prime is the data controller
            and the licensed party, which the footer line above says plainly.
          */}
          <div className="flex gap-6">
            {/*
              dark-ink-muted, not ink-faint. ink-faint is tuned for light
              grounds and measures 4.27:1 on this navy, just under the 4.5:1
              floor; dark-ink-muted is the token meant for dark surfaces and
              reaches 6.81:1. These are the legal links, so they are the last
              text on the page that should be hard to read.

              Padded for the same reason as the column links above: a 20px
              target is not reliably tappable.
            */}
            <Link href="/privacy" className="-my-3 inline-flex min-h-11 items-center rounded-sm text-dark-ink-muted transition-colors duration-150 hover:text-dark-ink">Privacy</Link>
            <Link href="/terms" className="-my-3 inline-flex min-h-11 items-center rounded-sm text-dark-ink-muted transition-colors duration-150 hover:text-dark-ink">Terms</Link>
            <Link href="/#trust" className="-my-3 inline-flex min-h-11 items-center rounded-sm text-dark-ink-muted transition-colors duration-150 hover:text-dark-ink">Data handling</Link>
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
