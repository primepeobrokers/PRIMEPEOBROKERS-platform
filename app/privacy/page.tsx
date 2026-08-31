import type { Metadata } from "next";
import { LegalPage, Section } from "@/app/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Prime PEO Brokers collects, uses, discloses, and protects personal information in connection with the PEO, payroll, and employer services evaluation.",
  alternates: { canonical: "/privacy" },
};

/*
 * Client-supplied legal copy, adapted from the white-label template. As in the
 * terms, the template's partner/platform split collapses into a single party:
 * A&G Advisors, LLC d/b/a Prime PEO Brokers. The Phase 1 / Phase 2 controller
 * distinction is kept, since it describes Prime's own change in role once it
 * is designated broker of record, not a second company.
 *
 * Retention periods in section 6 are now stated rather than left open. The
 * five-year figure follows Tex. Ins. Code s.1115.055, which requires records
 * behind a recommendation to be kept until the fifth anniversary of the
 * transaction; s.4005.106 sets a three-year floor for general agent records,
 * so five is the safe number to publish. The 90-day SSN window and 12-month
 * log/draft windows are ordinary practice, not statute.
 *
 * TODO: these are promises the code does not yet keep. Nothing deletes drafts,
 * expires census data, or rotates logs on a schedule, so the periods are
 * enforced manually today. A scheduled cleanup job should back them before
 * this sees real volume. The effective date is also still the ship date rather
 * than a date the client has confirmed.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" lastUpdated="2026-08-29">
      <Section heading="Before you begin">
        <p>
          This privacy policy describes how A&amp;G Advisors, LLC d/b/a Prime
          PEO Brokers (&ldquo;Prime,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, discloses,
          and protects personal information in connection with
          primepeobrokers.com (the &ldquo;Site&rdquo;) and the PEO, payroll,
          and employer services evaluation offered through it (the
          &ldquo;Services&rdquo;).
        </p>
        <p>
          By using the Site or submitting information through it, you
          acknowledge the practices described here.
        </p>
      </Section>

      <Section id="who" heading="1. Who handles your information">
        <p>
          Prime operates the Site and is the party you engage for the Services.
          Prime is a licensed insurance producer and PEO/HCM advisory firm.
          Prime hosts the Site, receives submissions, prepares PEO and payroll
          comparisons, and solicits proposals from professional employer
          organizations, payroll providers, and related vendors.
        </p>
        <p>
          <strong>Phase 1, evaluation.</strong> While we are preparing an
          evaluation, we process the information you submit for that purpose
          and on your instructions: to analyze your current costs, solicit
          proposals, and prepare comparisons for you.
        </p>
        <p>
          <strong>Phase 2, placement and ongoing service.</strong> Our role
          changes if you proceed with a PEO or payroll provider through us.
          This occurs when Prime is designated as the referring, placing, or
          servicing broker of record with a PEO or payroll provider, when Prime
          receives commission or fees from that vendor in connection with your
          account, or when you engage Prime directly for advisory,
          implementation, or ongoing service work. From that point we also
          handle your information for our own purposes: servicing your account,
          meeting our licensing and recordkeeping obligations, and marketing
          related services to you.
        </p>
        <p>
          <strong>Benchmarking.</strong> In both phases, we create and retain
          de-identified and aggregated market data: pricing, administrative fee
          structures, class-code loadings, burden rates, and plan design
          comparables, derived from submissions across all users of the
          platform. This data does not identify you or your company. It is used
          to improve evaluation accuracy and to publish market analyses, and we
          retain it indefinitely, including after any engagement ends. We do
          not re-identify it and we contractually prohibit recipients from
          attempting to.
        </p>
        <p>
          <strong>PEOs, payroll providers, and their carriers.</strong>{" "}
          Organizations that receive your information to produce quotes are
          independent controllers and handle it under their own privacy
          policies, which we do not control.
        </p>
      </Section>

      <Section id="collect" heading="2. Information we collect">
        <p>
          <strong>From you directly.</strong>
        </p>
        <ul>
          <li>
            <strong>Contact and business information.</strong> Name, title,
            business email, business phone, company name, mailing address,
            industry, entity structure, and FEIN.
          </li>
          <li>
            <strong>Employee census and payroll data.</strong> Employee names,
            dates of birth, gender, home ZIP code, job classification,
            workers&rsquo; compensation class code, hire date, wage or salary,
            hours, employment status, work state, dependent counts, benefit
            elections and tier, and, where a PEO or vendor requires it for
            underwriting or enrollment, Social Security numbers.
          </li>
          <li>
            <strong>Benefits, insurance, and risk information.</strong> Current
            plan details, premium and contribution amounts, renewal dates, loss
            runs, experience modification rates, claims history, and existing
            PEO or payroll vendor information.
          </li>
          <li>
            <strong>Financial information.</strong> Payroll totals, gross wages
            by entity and state, administrative fees and burden rates,
            unemployment insurance rate notices, and related cost data.
          </li>
          <li>
            <strong>Documents you upload.</strong> Invoices, payroll registers,
            SUTA rate notices, plan documents, census files, and other
            submissions.
          </li>
          <li>
            <strong>Communications.</strong> Emails, form submissions, call
            notes, and other correspondence.
          </li>
        </ul>
        <p>
          <strong>Automatically.</strong> IP address, browser type and version,
          operating system, device identifiers, referring URL, pages viewed,
          time on page, form completion progress, and click behavior. See
          section 8 for cookies.
        </p>
        <p>
          <strong>From other sources.</strong> Your referring broker or
          consultant, business data providers, public records, your current or
          prospective PEO or payroll provider, and professional networking
          platforms.
        </p>
      </Section>

      <Section
        id="non-visitors"
        heading="3. Information about people who did not visit the Site"
      >
        <p>
          If you are an employee, dependent, or beneficiary of a company that
          requested an evaluation, your information came from your employer or
          its broker, not from you.
        </p>
        <p>
          That information is used to prepare quotes, comparisons, and
          enrollment materials for your employer, and is transmitted to the
          PEOs and payroll providers your employer asked to be evaluated.
        </p>
        <p>
          Every business customer and partner is contractually required to
          represent that it has the authority and any necessary consents and
          notices in place before providing employee information. We do not
          independently verify that authority. If you believe your information
          was submitted without proper authority, contact us using the details
          in section 11 and we will investigate and, where appropriate, delete
          it.
        </p>
      </Section>

      <Section id="use" heading="4. How information is used">
        <p>Information is used to:</p>
        <ul>
          <li>
            Prepare PEO, payroll, and employer services evaluations, quotes,
            cost comparisons, and proposals
          </li>
          <li>
            Submit requests for proposal to PEOs, payroll providers, and
            related vendors
          </li>
          <li>
            Verify eligibility, assess risk, and confirm class codes and
            experience ratings
          </li>
          <li>
            Communicate about your request by email, phone, and text message
          </li>
          <li>
            Provide placement, advisory, implementation, and ongoing service
            work if you engage us
          </li>
          <li>
            Process enrollment, onboarding, and implementation if you select a
            vendor
          </li>
          <li>Operate, secure, troubleshoot, and improve the Site and platform</li>
          <li>
            Create de-identified and aggregated benchmarking and market
            analysis data, as described in section 1
          </li>
          <li>
            Market related products and services, subject to section 7
          </li>
          <li>
            Comply with legal, regulatory, licensing, and recordkeeping
            obligations
          </li>
          <li>Establish, exercise, or defend legal claims</li>
        </ul>
        <p id="resale" className="scroll-mt-24">
          <strong>Sale and sharing.</strong> We do not sell personal
          information for money. Advertising cookies, where enabled, may
          constitute &ldquo;sharing&rdquo; for cross-context behavioral
          advertising under some state laws. See section 8.
        </p>
      </Section>

      <Section id="disclosure" heading="5. How information is disclosed">
        <ul>
          <li>
            <strong>To PEOs, payroll providers, and related vendors.</strong>{" "}
            To obtain quotes and complete enrollment, limited to organizations
            relevant to your request.
          </li>
          <li>
            <strong>To service providers.</strong> Hosting, form processing,
            email delivery, CRM, e-signature, document storage, analytics, and
            telephony vendors, under contractual confidentiality obligations.
          </li>
          <li>
            <strong>To professional advisors.</strong> Attorneys, accountants,
            auditors, and insurers.
          </li>
          <li>
            <strong>In a business transaction.</strong> If Prime is involved in
            a merger, acquisition, financing, or asset sale, information may
            transfer as part of it.
          </li>
          <li>
            <strong>For legal reasons.</strong> Where required by law,
            subpoena, court order, or regulatory examination, or to protect
            rights, safety, or property, or investigate fraud.
          </li>
        </ul>
      </Section>

      <Section id="retention" heading="6. Retention">
        <ul>
          <li>
            Evaluation, quote, and placement records: five (5) years from the
            date the transaction is completed, consistent with Texas producer
            recordkeeping requirements
          </li>
          <li>
            Census files containing Social Security numbers: deleted or
            de-identified within ninety (90) days of the evaluation concluding,
            unless placement proceeds and the receiving vendor requires
            retention
          </li>
          <li>
            Incomplete drafts: deleted within twelve (12) months of your last
            activity if you never submit the record
          </li>
          <li>
            Marketing contact data: until you opt out or request deletion
          </li>
          <li>Site usage logs: twelve (12) months</li>
          <li>De-identified benchmarking data: retained indefinitely</li>
        </ul>
        <p>
          Where we hold records under our own licensing or legal obligations,
          those obligations govern regardless of a deletion request.
        </p>
      </Section>

      <Section id="marketing" heading="7. Marketing, calls, and text messages">
        <p>
          <strong>Email.</strong> Opt out of marketing email via the
          unsubscribe link or by contacting us. Transactional messages about an
          active evaluation or engagement will continue.
        </p>
        <p>
          <strong>Calls and texts.</strong> By providing a phone number and
          affirmatively consenting at submission, you agree that Prime PEO
          Brokers may contact you at that number by phone call and text
          message, including via automated dialing systems and prerecorded or
          artificial voice messages, regarding PEO, payroll, and employer
          services. Consent is not a condition of purchase. Message and data
          rates may apply. Reply STOP to opt out, HELP for help. Message
          frequency varies. This consent permits contact notwithstanding any Do
          Not Call registration, until revoked.
        </p>
      </Section>

      <Section id="cookies" heading="8. Cookies and tracking">
        <ul>
          <li>
            Strictly necessary cookies for security, sessions, and form
            function, which cannot be disabled
          </li>
          <li>Analytics cookies to measure Site usage and performance</li>
          <li>
            Advertising cookies, where enabled, for campaign measurement and
            targeted advertising
          </li>
        </ul>
        <p>
          Control cookies through your browser and, where presented, our cookie
          banner. We honor Global Privacy Control (GPC) signals as an opt-out
          of sale and sharing where required.
        </p>
      </Section>

      <Section id="rights" heading="9. Your privacy rights">
        <p>
          <strong>State rights.</strong> Depending on your state, including
          Texas, California, Colorado, Connecticut, Virginia, Utah, Oregon,
          Montana, and others, you may have the right to access, correct,
          delete, and obtain a portable copy of your personal information; to
          opt out of sale, targeted advertising, and certain profiling; to
          appeal a denial; and to be free from discrimination for exercising
          these rights.
        </p>
        <p>
          California residents may additionally request the categories of
          information collected, sources, business purposes, and categories of
          recipients for the preceding 12 months.
        </p>
        <p>
          <strong>Sensitive personal information.</strong> Social Security
          numbers and certain health plan information are sensitive personal
          information. They are used only for the purposes in this policy and
          not to infer characteristics about you. California residents may
          direct us to limit their use.
        </p>
        <p>
          <strong>Making a request.</strong> Submit requests to{" "}
          <a href="mailto:garrett@primepeobrokers.com">
            garrett@primepeobrokers.com
          </a>{" "}
          or <a href="tel:+12102012976">210-201-2976</a>. We verify identity
          before acting, typically against information
          already in our records. Authorized agents may submit requests with
          written permission. We respond within 45 days, extendable by 45 more
          where reasonably necessary, with notice.
        </p>
        <p>
          <strong>Limits.</strong> Certain information is exempt from deletion,
          including records subject to producer recordkeeping requirements,
          employment-related data, and information governed by the
          Gramm-Leach-Bliley Act. De-identified and aggregated benchmarking
          data is not personal information and is not subject to access or
          deletion requests. We will tell you if an exemption applies.
        </p>
      </Section>

      <Section id="security" heading="10. Security">
        <p>
          Administrative, technical, and physical safeguards protect personal
          information, including encryption in transit and at rest, access
          controls, and vendor due diligence. No system is perfectly secure. If
          a breach affecting your information occurs, notification will be
          provided as required by law by the party responsible for the affected
          systems.
        </p>
        <p>
          Do not email Social Security numbers or full census files
          unencrypted. Use the Site&rsquo;s secure upload.
        </p>
      </Section>

      <Section id="notices" heading="11. Additional notices">
        <p>
          <strong>Children.</strong> The Site is for business use by adults. We
          do not knowingly collect information from anyone under 16 through the
          Site. Dependent information for benefits enrollment comes from an
          employer and is handled under section 3.
        </p>
        <p>
          <strong>Health information.</strong> Where protected health
          information is handled on behalf of a group health plan, HIPAA and
          any applicable business associate agreement govern and control over
          this policy to the extent of conflict.
        </p>
        <p>
          <strong>Financial information.</strong> Certain information is
          governed by the Gramm-Leach-Bliley Act and its privacy and safeguards
          rules.
        </p>
        <p>
          <strong>Location.</strong> Information is processed in the United
          States. Accessing the Site from outside the US constitutes consent to
          that transfer.
        </p>
        <p>
          <strong>Third-party links.</strong> The Site links to PEO, payroll,
          and vendor sites. We are not responsible for their practices.
        </p>
      </Section>

      <Section id="contact" heading="12. Changes and contact">
        <p>
          Material changes will be posted here with a revised date and, where
          required, communicated directly.
        </p>
        <p>
          A&amp;G Advisors, LLC d/b/a Prime PEO Brokers
          <br />
          227 N Loop 1604 E, Ste 150
          <br />
          San Antonio, TX 78232
          <br />
          <a href="mailto:admin@primepeobrokers.com">
            admin@primepeobrokers.com
          </a>{" "}
          &middot; <a href="tel:+12102012976">210-201-2976</a>
        </p>
      </Section>
    </LegalPage>
  );
}
