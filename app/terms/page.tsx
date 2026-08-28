import type { Metadata } from "next";
import { LegalPage, Section } from "@/app/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms covering use of the Prime PEO Brokers site and discovery service: free to you, commission-paid, no guarantee of placement.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" lastUpdated="2026-08-28">
      <Section heading="What this service is">
        <p>
          Prime PEO Brokers is an insurance and PEO brokerage. You answer a
          structured set of questions about your business, a licensed broker
          reviews the record, and we come back with a comparison of the
          provider models that fit it.
        </p>
        <p>
          We are a broker, not a provider. We do not employ your staff, run
          your payroll, or underwrite your benefits. Any agreement you sign is
          between you and the provider you choose.
        </p>
      </Section>

      <Section heading="What it costs you">
        <p>
          Nothing. We are paid a commission by the provider you select, at the
          same rate whether you come through us or approach them directly. If
          you choose no provider, we are paid nothing and you owe us nothing.
        </p>
      </Section>

      <Section heading="No sponsored rankings">
        <p>
          We do not accept payment to rank, feature, or recommend a provider.
          Where commission rates differ between providers, that difference does
          not decide what we put in front of you. If a provider we hold no
          agreement with is the right answer, we will say so.
        </p>
      </Section>

      <Section heading="What we do not promise">
        <ul>
          <li>
            We cannot guarantee that any provider will quote your business, or
            quote it at a particular price.
          </li>
          <li>
            Comparisons are prepared from the information you give us. If your
            headcount, classification, or spend figures are wrong, the
            comparison will be too.
          </li>
          <li>
            Figures in a comparison are estimates based on provider pricing at
            the time. Final terms come from the provider.
          </li>
          <li>
            We are not your lawyer, accountant, or tax adviser. Nothing here is
            legal, tax, or employment advice.
          </li>
        </ul>
      </Section>

      <Section heading="Your side of it">
        <p>
          Give us accurate information, and only information you are entitled
          to share. Do not submit anyone else&rsquo;s personal data without a
          lawful basis, and do not use this site to attempt to access records
          that are not yours.
        </p>
      </Section>

      <Section heading="Existing broker of record">
        <p>
          If another broker holds the appointment for your plan year, we can
          model your current arrangement against the market for comparison, but
          we cannot quote a provider where that appointment stands.
        </p>
      </Section>

      <Section heading="Where we operate">
        <p>
          US-domiciled employers only. For overseas headcount we can point you
          toward an employer of record, which we do not broker.
        </p>
      </Section>

      <Section heading="Your data">
        <p>
          How we handle your record is set out in the{" "}
          <a href="/privacy">privacy policy</a>, which forms part of these
          terms.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          The service is provided as is. To the fullest extent the law allows,
          we are not liable for indirect or consequential loss, or for
          decisions you make on the basis of a comparison. Nothing here limits
          liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms. The date at the top shows the current
          version, and continuing to use the site after a change means you
          accept it.
        </p>
      </Section>
    </LegalPage>
  );
}
