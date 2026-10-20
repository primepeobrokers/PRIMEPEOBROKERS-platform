/**
 * The legal wording, named once.
 *
 * Counsel supplied every string in this file as final (October 2026). They
 * are constants rather than inline copy for one reason: the consent record
 * stores "the exact consent text shown", so the words a visitor reads at
 * submission and the words written to consent_records must be the same
 * string, not two copies kept in step by hand. The pages, the discovery flow
 * and the server action all import from here.
 *
 * Changing any of these is a legal change, not a copy edit. If the Terms or
 * Privacy Policy change, bump the matching version date: it is printed as
 * "Last updated" on the page AND stamped onto every consent record, which is
 * how a record proves which version someone agreed to.
 *
 * No "server-only": the discovery flow renders these client-side.
 */

/** The party that provides the Services on every tenant, whatever the branding. */
export const LEGAL_ENTITY = "A&G Advisors, LLC d/b/a Prime PEO Brokers";

/** ISO dates. Shown as "Last updated" and stamped onto each consent record. */
export const TERMS_VERSION = "2026-10-17";
export const PRIVACY_VERSION = "2026-10-20";

/**
 * Checkbox 1, required. Mentions "Section 14" by number: the arbitration
 * section of the Terms. Inserting a numbered section into the Terms would
 * silently make this point at the wrong one, which is why the partner-branded
 * sites section is numbered 2A.
 */
export const CONSENT_TERMS_TEXT =
  "I agree to the Terms and Conditions and Privacy Policy of A&G Advisors, LLC d/b/a Prime PEO Brokers, including the binding arbitration provision and class action waiver in Section 14 of the Terms. I confirm I am authorized to act for this company and have the authority and any required consents to submit the information provided, including information about employees.";

/**
 * Checkbox 2, optional. Sits beside the phone field and never blocks
 * submission. Calls only: Prime does not text clients (client decision,
 * 20 Oct 2026), so the wording carries no texting, automated-dialling or
 * STOP/HELP language. Stored in consent_records.sms_text, a column named
 * before that decision; the column holds whatever this constant says.
 */
export const CONSENT_CALL_TEXT =
  "I agree that Prime PEO Brokers may call me at the phone number I provided about PEO, payroll, and employer services. Consent is not a condition of any purchase.";

/** Shown directly under the Submit button. */
export const SUBMIT_NOTICE_TEXT =
  "By clicking Submit, you agree to the Terms and Privacy Policy above. Nothing is shared with a provider until your advisor confirms the list with you.";

/**
 * The phrases inside CONSENT_TERMS_TEXT that render as links. The flow splits
 * the constant on these rather than restating the sentence in JSX, so the
 * rendered words cannot drift from the stored ones.
 */
export const CONSENT_LINKS: ReadonlyArray<{ phrase: string; href: string }> = [
  { phrase: "Terms and Conditions", href: "/terms" },
  { phrase: "Privacy Policy", href: "/privacy" },
];

/** Splits text into plain runs and the link phrases above, in order. */
export function splitConsentLinks(
  text: string,
): Array<{ text: string; href?: string }> {
  const out: Array<{ text: string; href?: string }> = [];
  let rest = text;
  while (rest) {
    let next: { at: number; phrase: string; href: string } | null = null;
    for (const l of CONSENT_LINKS) {
      const at = rest.indexOf(l.phrase);
      if (at !== -1 && (!next || at < next.at)) next = { at, ...l };
    }
    if (!next) {
      out.push({ text: rest });
      break;
    }
    if (next.at > 0) out.push({ text: rest.slice(0, next.at) });
    out.push({ text: next.phrase, href: next.href });
    rest = rest.slice(next.at + next.phrase.length);
  }
  return out;
}
