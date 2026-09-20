import type { Metadata } from "next";

import { LandingSections } from "@/app/components/landing/landing-sections";

/**
 * The house marketing page.
 *
 * STATICALLY PRERENDERED, AND IT MUST STAY THAT WAY.
 *
 * The sections live in LandingSections because a partner subdomain renders the
 * same page in their own brand (app/partner-home/page.tsx). This route passes
 * `tenant={null}`, which is what keeps it static: it reads no headers, fetches
 * no data, and never calls getTenant().
 *
 * Do not make this route tenant-aware. getTenant() reads headers(), which
 * would flip this page from prerendered to dynamic and cost the client's own
 * marketing site its TTFB. `pnpm build` prints a `○` beside `/` when this is
 * right and an `ƒ` when it is not.
 */
export const metadata: Metadata = {
  title: "Prime PEO Brokers: the easiest way to shop for PEO, Payroll & HR tech",
  description:
    "Research, evaluate, and choose the right PEO, payroll, and HR software for free. Answer a structured set of questions once; an expert on our team does the legwork and delivers your tailored proposal. No pushy vendor reps. You never pay us.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return <LandingSections tenant={null} />;
}
