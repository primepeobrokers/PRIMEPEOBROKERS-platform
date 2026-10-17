import type { Metadata } from "next";
import { LegalPage, Section } from "@/app/components/legal-page";
import { TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description:
    "The terms governing use of the Prime PEO Brokers site and the PEO, payroll, and employer services evaluation offered through it.",
  alternates: { canonical: "/terms" },
};

/*
 * Client-supplied legal copy, adapted from the white-label template, with
 * counsel's October 2026 amendments for partner-branded Sites: the Site
 * definition in the opening paragraph, section 2A, and the referral-partner
 * paragraph closing section 3. Prime provides the Services on every tenant,
 * so these are one document served unchanged on every host.
 *
 * The version date lives in lib/legal.ts, because it is also stamped onto
 * every consent record. Bump it there when this text changes.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms and conditions" lastUpdated={TERMS_VERSION}>
      <Section heading="Before you begin">
        <p>
          These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access
          to and use of primepeobrokers.com, primevantagehcm.com, and any
          website, page, or embedded tool that displays the Prime platform,
          including versions branded with the name or logo of a referral
          partner (each, a &ldquo;Site&rdquo;), and the PEO, payroll, and
          employer services evaluation offered through them (the
          &ldquo;Services&rdquo;). The Services are provided by A&amp;G
          Advisors, LLC d/b/a Prime PEO Brokers (&ldquo;Prime,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), a licensed
          insurance producer and PEO/HCM advisory firm, regardless of the
          branding shown on the Site.
        </p>
        <p>
          By accessing the Site, submitting information, or requesting an
          evaluation, you agree to these Terms. If you do not agree, do not use
          the Site.
        </p>
        <p>
          <strong>
            These Terms contain a limitation of liability (section 10) and a
            binding arbitration provision with a class action waiver (section
            14). Please read them.
          </strong>
        </p>
      </Section>

      <Section id="eligibility" heading="1. Eligibility and authority">
        <p>
          The Site is intended solely for business use by employers, their
          authorized representatives, and their advisors. It is not for
          personal, family, or household purposes.
        </p>
        <p>
          By using the Site you represent that you are at least 18 years old,
          that you are authorized to act on behalf of the business you
          identify, and that you have the authority and any required consents
          to submit all information you provide, including information about
          employees, dependents, and beneficiaries who are not parties to these
          Terms.
        </p>
      </Section>

      <Section id="scope" heading="2. What the Services are, and are not">
        <p>
          <strong>Nature of the Services.</strong> The Services produce
          estimates and comparisons based on information you provide and on
          quotes solicited from third-party vendors. They are a purchasing and
          benchmarking aid.
        </p>
        <p>
          <strong>No professional advice.</strong> Nothing on the Site or in
          any output constitutes legal, tax, accounting, actuarial, employment
          law, or investment advice. PEO arrangements involve co-employment,
          and their tax, liability, workers&rsquo; compensation, and employment
          law consequences vary by state and by facts specific to your
          business. You should consult your own attorney and accountant before
          entering into any PEO or payroll arrangement. We are not your
          attorney or accountant and no attorney-client or comparable
          relationship is created.
        </p>
        <p>
          <strong>No guarantee of savings or results.</strong> Cost
          projections, savings estimates, and comparisons are illustrative and
          depend entirely on the accuracy and completeness of the information
          you supply. Actual costs are determined by the vendor you select,
          following its own underwriting, and may differ materially. We do not
          guarantee any savings, any particular quote, any specific rate, or
          that any vendor will offer you terms at all.
        </p>
        <p>
          <strong>Quotes are not binding.</strong> Proposals presented to you
          are the offers of third-party vendors, subject to their underwriting,
          their terms, and their acceptance. They are not offers by Prime, and
          are not binding on any party until you and the vendor execute a
          written agreement.
        </p>
        <p>
          <strong>Not insurance.</strong> We do not issue insurance, provide
          coverage, or assume any risk. Workers&rsquo; compensation, health,
          and other coverages available through a PEO are provided by the PEO
          or its carriers under their own contracts.
        </p>
      </Section>

      {/*
        2A, not 3. Counsel's text cross-references sections by number: this
        section points at Section 3 for compensation, and the step 6 consent
        (lib/legal.ts) points at Section 14 for arbitration. Renumbering
        everything after 2 would make both point at the wrong section.
      */}
      <Section id="partner-sites" heading="2A. Partner-branded Sites">
        <p>
          You may access the Services through a Site that displays the name or
          logo of a referral partner, such as your insurance broker,
          accountant, financial advisor, or HR consultant. The Services on any
          such Site are provided by Prime, not by the partner. Unless the
          partner separately agrees in writing, the partner is not a party to
          these Terms, does not provide the Services, and does not prepare the
          evaluation or proposals. The partner may receive compensation from
          Prime as described in Section 3. Information you submit is received
          by Prime and handled under Prime&rsquo;s privacy policy. Where Prime
          shares your information with the partner, it is limited to what is
          described in the privacy policy.
        </p>
      </Section>

      <Section id="compensation" heading="3. Compensation disclosure">
        <p>
          We are compensated by the vendors we place business with. If you
          engage a PEO, payroll provider, or related vendor as a result of the
          Services, Prime may receive commission, override, referral fees,
          bonuses, or other compensation from that vendor. Compensation may
          vary by vendor, by product, and by volume.
        </p>
        <p>
          We do not charge you a fee for the evaluation unless separately
          agreed in writing.
        </p>
        <p>
          We evaluate vendors we have relationships with. We do not represent
          that we survey every PEO or payroll provider in the market, or that
          the vendors presented are the lowest-cost options available anywhere.
          You are free to obtain quotes independently and to engage any vendor
          directly.
        </p>
        <p>
          Additional compensation detail is available on request at{" "}
          <a href="mailto:admin@primepeobrokers.com">
            admin@primepeobrokers.com
          </a>
          .
        </p>
        <p>
          <strong>Referral partners.</strong> If you reached us through a
          referral partner, such as your insurance broker, accountant,
          financial advisor, or HR consultant, Prime may pay that partner a
          referral fee or share of Prime&rsquo;s compensation. Referral
          compensation is paid by Prime and does not increase the price you
          pay any provider.
        </p>
      </Section>

      <Section id="obligations" heading="4. Your obligations">
        <p>You agree to:</p>
        <ul>
          <li>
            Provide accurate, current, and complete information, and to correct
            it promptly if it changes
          </li>
          <li>
            Submit employee and payroll data only where you have authority and
            any required consents to do so
          </li>
          <li>
            Not submit information you are contractually or legally barred from
            disclosing
          </li>
          <li>
            Keep any credentials issued to you confidential and notify us of
            unauthorized use
          </li>
          <li>Use the Site only for lawful purposes</li>
        </ul>
        <p>You agree not to:</p>
        <ul>
          <li>
            Access the Site by automated means, scrape it, or attempt to
            extract underlying data or pricing models
          </li>
          <li>
            Reverse engineer, decompile, or attempt to derive the
            platform&rsquo;s source code or methodology
          </li>
          <li>
            Use the Services to gather competitive intelligence on behalf of a
            PEO, payroll provider, or competing broker
          </li>
          <li>
            Submit false, fabricated, or materially incomplete data to obtain
            quotes you do not intend to consider in good faith
          </li>
          <li>
            Interfere with, disrupt, or attempt to gain unauthorized access to
            the Site or its systems
          </li>
          <li>
            Resell, sublicense, or make the Services available to third parties
            without written authorization
          </li>
        </ul>
        <p>
          Inaccurate data produces inaccurate results. We are not responsible
          for outcomes based on information you supplied incorrectly or
          incompletely.
        </p>
      </Section>

      <Section id="confidentiality" heading="5. Confidentiality of proposals">
        <p>
          Quotes, pricing, fee structures, and proposals provided to you are
          confidential and provided for your internal evaluation only. You
          agree not to disclose them to any PEO, payroll provider, broker, or
          competitor, or to use them to solicit competing bids outside the
          evaluation process, without our written consent.
        </p>
        <p>
          This does not restrict disclosure to your own attorneys, accountants,
          officers, and directors who need to know and who are bound by
          confidentiality, or disclosure required by law.
        </p>
      </Section>

      <Section id="ip" heading="6. Intellectual property">
        <p>
          The Site, the platform, the evaluation methodology, comparison
          formats, report templates, benchmarking data, and all related
          software and content are owned by Prime or its licensors and are
          protected by intellectual property law.
        </p>
        <p>
          You receive a limited, revocable, non-exclusive, non-transferable
          license to access the Site and use outputs prepared for you, solely
          for evaluating and purchasing services for your own business. All
          other rights are reserved.
        </p>
        <p>
          You may use reports prepared for you internally and share them with
          your own advisors. You may not publish them, distribute them
          commercially, or remove any attribution or notices.
        </p>
      </Section>

      <Section id="data" heading="7. Data you submit">
        <p>
          Your information is handled as described in our{" "}
          <a href="/privacy">privacy policy</a>, which is incorporated into
          these Terms.
        </p>
        <p>
          You grant us the right to use information you submit to perform the
          Services, and you acknowledge that de-identified and aggregated data
          derived from your submissions may be retained and used for
          benchmarking and market analysis as described in the privacy policy.
          De-identified data does not identify you or your business.
        </p>
      </Section>

      <Section id="vendors" heading="8. Third-party vendors">
        <p>
          We are not a party to any agreement between you and a PEO, payroll
          provider, or other vendor. We do not control and are not responsible
          for their services, their pricing, their underwriting decisions,
          their financial condition, their regulatory compliance, their data
          practices, or their performance.
        </p>
        <p>
          Any dispute with a vendor is between you and that vendor. Our role
          ends when you contract with them, except where you separately engage
          us for ongoing service work.
        </p>
        <p>
          We do not warrant the accuracy of information vendors provide to us
          and pass through to you.
        </p>
      </Section>

      <Section id="disclaimers" heading="9. Disclaimers">
        <p>
          THE SITE AND SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
          TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES
          INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
          NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING
          OR USAGE OF TRADE.
        </p>
        <p>
          WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, TIMELY,
          SECURE, OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT ANY
          OUTPUT WILL BE ACCURATE, COMPLETE, OR RELIABLE.
        </p>
      </Section>

      <Section id="liability" heading="10. Limitation of liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, NEITHER PRIME NOR ITS
          MEMBERS, OFFICERS, EMPLOYEES, OR AGENTS WILL BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE
          DAMAGES, OR FOR LOST PROFITS, LOST SAVINGS, LOST BUSINESS, LOST DATA,
          OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATING TO THE SITE OR
          SERVICES, EVEN IF ADVISED OF THE POSSIBILITY.
        </p>
        <p>
          OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THE SITE OR
          SERVICES WILL NOT EXCEED THE GREATER OF (A) THE FEES YOU PAID US IN
          THE TWELVE MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR
          (B) ONE THOUSAND DOLLARS ($1,000).
        </p>
        <p>
          THESE LIMITS APPLY REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF
          A REMEDY FAILS OF ITS ESSENTIAL PURPOSE. SOME JURISDICTIONS DO NOT
          ALLOW CERTAIN EXCLUSIONS, SO PORTIONS MAY NOT APPLY TO YOU.
        </p>
      </Section>

      <Section id="indemnification" heading="11. Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless A&amp;G Advisors,
          LLC d/b/a Prime PEO Brokers, and its members, officers, employees,
          and agents, from any claim, loss, liability, damage, penalty, or
          expense (including reasonable attorneys&rsquo; fees) arising out of
          or relating to:
        </p>
        <ul>
          <li>Your breach of these Terms</li>
          <li>
            Information you submitted that was inaccurate, incomplete, or
            submitted without authority or required consent
          </li>
          <li>
            Any claim by an employee, dependent, or beneficiary whose
            information you submitted
          </li>
          <li>Your use of the Site or Services in violation of law</li>
          <li>Your agreement or dispute with any vendor</li>
        </ul>
      </Section>

      <Section
        id="electronic"
        heading="12. Electronic communications and signatures"
      >
        <p>
          You consent to receive communications from us electronically,
          including notices, disclosures, and agreements, and agree that
          electronic delivery satisfies any legal requirement that
          communications be in writing.
        </p>
        <p>
          You agree that electronic signatures and records have the same effect
          as handwritten signatures and paper records under the federal ESIGN
          Act and applicable state law.
        </p>
        <p>
          Telephone and text message consent is addressed in the{" "}
          <a href="/privacy">privacy policy</a>.
        </p>
      </Section>

      <Section id="termination" heading="13. Suspension and termination">
        <p>
          We may suspend or terminate your access at any time, with or without
          notice, for any reason, including suspected violation of these Terms.
          You may stop using the Site at any time.
        </p>
        <p>
          Sections 2, 3, 5, 6, 7, 8, 9, 10, 11, 14, and 15 survive termination.
        </p>
      </Section>

      <Section id="arbitration" heading="14. Dispute resolution and arbitration">
        <p>
          <strong>
            Please read this section carefully. It affects how disputes are
            resolved.
          </strong>
        </p>
        <p>
          <strong>Informal resolution first.</strong> Before initiating
          arbitration, you agree to notify us in writing at{" "}
          <a href="mailto:garrett@primepeobrokers.com">
            garrett@primepeobrokers.com
          </a>{" "}
          describing the dispute and the relief sought, and to negotiate in
          good faith for sixty (60) days.
        </p>
        <p>
          <strong>Binding arbitration.</strong> Any dispute arising out of or
          relating to these Terms, the Site, or the Services that is not
          resolved informally will be settled by binding arbitration
          administered by the American Arbitration Association under its
          Commercial Arbitration Rules, before a single arbitrator, seated in
          Bexar County, Texas. Judgment on the award may be entered in any
          court of competent jurisdiction.
        </p>
        <p>
          <strong>Class action waiver.</strong> Disputes will be arbitrated on
          an individual basis only. You and we waive any right to bring or
          participate in a class, collective, consolidated, or representative
          action. The arbitrator may not consolidate claims or preside over any
          representative proceeding. If this waiver is found unenforceable as
          to a particular claim, that claim proceeds in court and the remainder
          stays in arbitration.
        </p>
        <p>
          <strong>Exceptions.</strong> Either party may bring an individual
          action in small claims court, and either party may seek injunctive
          relief in court to protect intellectual property or confidential
          information.
        </p>
        <p>
          <strong>Governing law and venue.</strong> These Terms are governed by
          the laws of the State of Texas, without regard to conflict of laws
          principles. For any matter not subject to arbitration, exclusive
          venue lies in the state and federal courts in Bexar County, Texas,
          and you consent to that jurisdiction.
        </p>
      </Section>

      <Section id="general" heading="15. General">
        <p>
          <strong>Changes.</strong> We may modify these Terms at any time by
          posting a revised version with an updated date. Material changes take
          effect thirty (30) days after posting. Continued use after that
          constitutes acceptance.
        </p>
        <p>
          <strong>Entire agreement.</strong> These Terms and the privacy policy
          are the entire agreement regarding the Site and Services, superseding
          prior understandings. A separately executed written agreement between
          you and Prime controls over these Terms to the extent of conflict.
        </p>
        <p>
          <strong>Severability.</strong> If any provision is held
          unenforceable, it is modified to the minimum extent necessary and the
          remainder stays in effect.
        </p>
        <p>
          <strong>No waiver.</strong> Failure to enforce any provision is not a
          waiver of it.
        </p>
        <p>
          <strong>Assignment.</strong> You may not assign these Terms without
          our written consent. We may assign them in connection with a merger,
          acquisition, or sale of assets.
        </p>
        <p>
          <strong>Force majeure.</strong> Neither party is liable for delays or
          failures caused by events beyond reasonable control.
        </p>
      </Section>

      <Section id="contact" heading="16. Contact">
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
