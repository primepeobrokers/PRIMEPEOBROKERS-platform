import type { Metadata } from "next";
import { LegalPage, Section } from "@/app/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Prime PEO Brokers collects when you run a discovery, where it is stored, who can see it, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" lastUpdated="2026-08-28">
      <Section heading="The short version">
        <p>
          We collect what a broker needs to quote your business, we store it in
          one encrypted database, we show it to your assigned broker and nobody
          else, and we never sell it. No provider sees your record until you
          approve the shortlist. Ask us to delete it and we will, within 30
          days.
        </p>
      </Section>

      <Section heading="What we collect">
        <p>When you run a discovery, you give us:</p>
        <ul>
          <li>
            <strong>About you:</strong> name, work email, and optionally phone,
            job title, and your role in the decision.
          </li>
          <li>
            <strong>About your company:</strong> company name, website,
            industry, employee count, the states you employ people in, and
            which product category you are shopping for.
          </li>
          <li>
            <strong>Workforce and payroll:</strong> how your people are
            classified, headcount by type, who runs payroll today, what you pay
            them, and how complex your payroll is.
          </li>
          <li>
            <strong>Benefits and HR:</strong> what you offer today, your
            benefits platform and broker, your annual benefits spend, and the
            HR support you are looking for.
          </li>
          <li>
            <strong>Your search:</strong> what is driving it, what else you
            want quoted, your current tech stack, timeline, and budget posture.
          </li>
        </ul>
        <p>
          We deliberately do <strong>not</strong> ask for your federal tax ID,
          nor for any individual employee&rsquo;s name, salary, or health
          information. Compensation is collected as bands only.
        </p>
      </Section>

      <Section heading="Why we collect it">
        <p>
          Every pricing model in this market is calculated from headcount,
          worker classification, and benefits spend. Without them a quote is a
          guess. We use your record to prepare a comparison, and to have a
          broker contact you about it. We do not use it for anything else.
        </p>
      </Section>

      <Section heading="Where it is stored">
        <p>
          Your record is stored in a Postgres database hosted by Supabase,
          encrypted in transit and at rest. There is no public or anonymous
          read path to it: the database rejects unauthenticated reads at the
          data layer, not just in the interface.
        </p>
        <p>
          We use Resend to send email: your resume link, your submission
          confirmation, and an internal notification to the brokerage team.
        </p>
        <p>
          If you leave the flow partway through, your answers are saved as a
          draft so you can come back. We keep a copy in your own browser
          (under the key <code>pv-discovery-draft</code>) and, if you asked us
          to email you a link, on our server against a one-time resume token.
          Clearing your browser data removes the local copy.
        </p>
      </Section>

      <Section heading="Who can see it">
        <p>
          Your assigned broker and their team. Access is authenticated and
          scoped at the data layer, so staff outside your account cannot query
          your record.
        </p>
        <p>
          <strong>No provider sees your submission until you approve it.</strong>{" "}
          Your broker reviews the record first, tells you which providers they
          intend to quote, and you confirm the list.
        </p>
      </Section>

      <Section id="resale" heading="We do not sell your data">
        <p>
          Your submission is not sold, syndicated, rented, or shared with a
          data broker. We are paid a commission by the provider you choose, at
          the same rate whether you come through us or not. If you pick nobody,
          we are paid nothing. There is no version of our business that
          involves selling your record.
        </p>
        <p>
          Because we do not sell personal information, there is nothing to opt
          out of. If you would still like your record removed, see below.
        </p>
      </Section>

      <Section heading="Deleting your record">
        <p>
          Email us and we will delete your record and any partial drafts within
          30 days, except anything we are required to retain for insurance
          licensing and recordkeeping obligations. We will tell you if anything
          falls into that category.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Depending on where you live, you may have the right to see what we
          hold about you, correct it, have it deleted, or object to how we use
          it. Residents of California and the EU/UK have specific rights under
          the CCPA/CPRA and the GDPR respectively. Write to us and we will
          action the request.
        </p>
      </Section>

      <Section heading="Cookies and analytics">
        <p>
          We do not run advertising trackers or third-party analytics on this
          site. The only thing stored in your browser is the discovery draft
          described above, and a session cookie if you sign in to the broker
          console.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          This is a service for employers. It is not directed at anyone under
          18 and we do not knowingly collect their information.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change how we handle your data we will update this page and
          move the date at the top. Material changes affecting records we
          already hold will be emailed to the address on the record.
        </p>
      </Section>
    </LegalPage>
  );
}
