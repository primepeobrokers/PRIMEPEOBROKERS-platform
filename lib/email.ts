import "server-only";

import { Resend } from "resend";
import { STEPS, formatAnswer, type Answers } from "@/lib/discovery/schema";

const FROM =
  process.env.EMAIL_FROM ?? "Prime PEO Brokers <onboarding@resend.dev>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(
      "[email] RESEND_API_KEY is not set: transactional email skipped.",
    );
    return null;
  }
  return new Resend(key);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/*
  ============================================================================
  The shared template.

  Email HTML is written for the clients people actually use, which means
  tables, inline styles, and system fonts. The rules this file follows and
  why:

  - Layout is nested tables, not flex or grid. Outlook renders with Word's
    engine and knows nothing else.
  - The logo cube is a hosted PNG, not the site's inline SVG: Gmail strips
    <svg> and Outlook cannot render SVG images at all. The wordmark next to
    it is live text, so when a client blocks remote images the header still
    says who the mail is from instead of showing a broken-image square.
  - System font stack rather than the site's webfonts. Webfont support in
    mail clients is poor enough that designing around it means designing for
    the fallback anyway, and the system stack is the honest version of the
    clean look this template is after.
  - Colours are the brand tokens from app/globals.css, hardcoded because
    email has no stylesheet: navy #19233B, soft ink #3E465A, muted #63697A,
    faint #808693, line #E1E2E6, sunken #F5F5F6, orange #FF2D00. The orange
    appears only on the button with a bold white label, matching the
    contrast rule in the brand guide.
  - No VML button fallback for Outlook desktop. The audience is a small
    team and their leads, the button degrades to a readable link, and the
    plain-text part carries every URL anyway.

  Every send includes a text alternative. Some people read mail that way,
  and multipart mail scores better with spam filters.
  ============================================================================
*/

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function renderEmail(opts: {
  /** Inbox preview line. Shown after the subject, never in the body. */
  preheader: string;
  /** Small uppercase line above the heading, e.g. "REF 1087". Optional. */
  eyebrow?: string;
  heading: string;
  /** Card content below the heading. Already-escaped HTML. */
  bodyHtml: string;
  /** Muted lines under the card. Already-escaped HTML, one per line. */
  footerLines: string[];
}): string {
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${MONO};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#63697A;">${opts.eyebrow}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <!-- Without an explicit charset, any client that ignores the transport
       header renders the middle dots and typographic quotes as mojibake. -->
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background-color:#F5F5F6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F6;">
    <tr>
      <td align="center" style="padding:36px 16px 44px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">

          <tr>
            <td style="padding:0 6px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${siteUrl()}/brand/email-mark.png" width="30" height="30" alt="" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;padding-left:11px;font-family:${FONT};font-size:13px;letter-spacing:.08em;color:#19233B;white-space:nowrap;">
                    PRIME&nbsp;<span style="font-weight:700;">PEO</span>&nbsp;BROKERS
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FFFFFF;border:1px solid #E1E2E6;border-radius:14px;padding:42px 44px;">
              ${eyebrow}
              <h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.015em;color:#19233B;">${opts.heading}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 6px 0;font-family:${FONT};font-size:12.5px;line-height:1.7;color:#808693;">
              ${opts.footerLines.map((l) => `<p style="margin:0 0 4px;">${l}</p>`).join("")}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A body paragraph in the card. */
function para(html: string): string {
  return `<p style="margin:18px 0 0;font-family:${FONT};font-size:16.5px;line-height:1.65;color:#3E465A;">${html}</p>`;
}

/** The one place orange appears: a button with a bold white label. */
function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;">
      <tr>
        <td style="background-color:#FF2D00;border-radius:10px;">
          <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>`;
}

/** A composed message, ready to hand to Resend. Exported for the preview script. */
export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Notifies the client's team that a new record was submitted. */
export function composeSubmissionNotification(input: {
  ref: number;
  id: string;
  answers: Answers;
}): ComposedEmail {
  const company = formatAnswer("company", input.answers);
  const contact = formatAnswer("fullName", input.answers);
  const email = formatAnswer("email", input.answers);
  const consoleLink = `${siteUrl()}/console/leads/${input.id}`;

  /*
    The full record travels in the mail on purpose: the person triaging reads
    it from their inbox on a phone and decides whether it can wait, without a
    sign-in round trip. Muted labels, navy values, a hairline between steps.
  */
  const sections = STEPS.map((step) => {
    const rows = step.fields
      .map(
        (f) => `
        <tr>
          <td style="padding:7px 18px 7px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:#63697A;vertical-align:top;white-space:nowrap;">${escapeHtml(f.label)}</td>
          <td style="padding:7px 0;font-family:${FONT};font-size:14.5px;line-height:1.5;color:#19233B;">${escapeHtml(formatAnswer(f.id, input.answers))}</td>
        </tr>`,
      )
      .join("");
    return `
      <p style="margin:30px 0 6px;font-family:${MONO};font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#63697A;border-top:1px solid #E1E2E6;padding-top:22px;">${escapeHtml(step.title)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
  }).join("");

  const text = [
    `New lead: ${company}`,
    `${contact} (${email})`,
    ``,
    `Open REF ${input.ref}: ${consoleLink}`,
    ``,
    ...STEPS.flatMap((step) => [
      step.title.toUpperCase(),
      ...step.fields.map(
        (f) => `  ${f.label}: ${formatAnswer(f.id, input.answers)}`,
      ),
      ``,
    ]),
  ].join("\n");

  return {
    subject: `New discovery record · REF ${input.ref} · ${company}`,
    text,
    html: renderEmail({
      preheader: `${company} · ${contact}`,
      eyebrow: `REF ${input.ref}`,
      heading: `New lead: ${escapeHtml(company)}`,
      bodyHtml:
        para(`${escapeHtml(contact)} · ${escapeHtml(email)}`) +
        button(consoleLink, `Open REF ${input.ref}`) +
        sections,
      footerLines: [
        "Sent to the team the moment a discovery record is submitted.",
      ],
    }),
  };
}

export async function sendSubmissionNotification(input: {
  ref: number;
  id: string;
  answers: Answers;
}) {
  const resend = getResend();
  const to = process.env.LEAD_NOTIFY_EMAIL;
  if (!resend || !to) {
    if (!to) console.warn("[email] LEAD_NOTIFY_EMAIL is not set: skipped.");
    return;
  }
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    ...composeSubmissionNotification(input),
  });
  if (error) console.error("[email] send failed:", error.message);
}

/**
 * Emails a one-time password-reset code.
 *
 * Unlike the notification senders, this one reports whether delivery actually
 * happened. Resend signals API-level failures through the `error` field rather
 * than throwing, so an unchecked send would leave the user staring at a
 * code-entry box waiting for a code that was never accepted for delivery.
 */
export function composePasswordResetCode(input: {
  code: string;
  expiresInMinutes: number;
}): ComposedEmail {
  const code = escapeHtml(input.code);
  return {
    // The code goes in the subject too: on a phone it is readable from the
    // notification without opening the message.
    subject: `Your Prime PEO Brokers reset code is ${input.code}`,
    text: [
      `Your reset code is ${input.code}`,
      ``,
      `Enter it to set a new console password. It expires in ${input.expiresInMinutes} minutes and works once. Asking for another code cancels this one.`,
      ``,
      `If you did not ask for this, ignore this email. Your password has not changed, and nobody can use the code without your inbox.`,
    ].join("\n"),
    html: renderEmail({
      preheader: `Expires in ${input.expiresInMinutes} minutes.`,
      heading: "Your reset code",
      bodyHtml:
        para("Enter this code to set a new console password.") +
        `<div style="margin:26px 0 0;background-color:#F5F5F6;border-radius:12px;padding:24px;text-align:center;">
           <span style="font-family:${MONO};font-size:40px;font-weight:600;letter-spacing:.18em;color:#19233B;">${code}</span>
         </div>` +
        para(
          `It expires in ${input.expiresInMinutes} minutes and works once. Asking for another code cancels this one.`,
        ),
      footerLines: [
        "If you did not ask for this, ignore this email. Your password has not changed, and nobody can use the code without your inbox.",
      ],
    }),
  };
}

export async function sendPasswordResetCode(input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<{ ok: boolean }> {
  const resend = getResend();
  if (!resend) return { ok: false };

  const { error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    ...composePasswordResetCode(input),
  });
  if (error) {
    console.error("[email] reset code delivery failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Emails the visitor a link that returns them to the step they left. */
export function composeResumeLink(input: {
  token: string;
  stepsCompleted: number;
}): ComposedEmail {
  const link = `${siteUrl()}/discovery?r=${input.token}`;
  return {
    subject:
      "Your Prime PEO Brokers discovery record: pick up where you left off",
    text: [
      `You are ${input.stepsCompleted} of 6 steps in, and everything you entered is saved.`,
      ``,
      `Return to your record: ${link}`,
      ``,
      `The link takes you back to the step you left and expires in 30 days. No other mail follows from this. If you did not request it, ignore this email.`,
    ].join("\n"),
    html: renderEmail({
      preheader: `${input.stepsCompleted} of 6 steps saved.`,
      heading: "Pick up where you left off",
      bodyHtml:
        para(
          `You are ${input.stepsCompleted} of 6 steps in, and everything you entered is saved.`,
        ) +
        button(link, "Continue your record") +
        `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:#808693;">Or paste this into your browser:<br/><a href="${link}" style="color:#63697A;">${link}</a></p>`,
      footerLines: [
        "The link takes you back to the step you left and expires in 30 days.",
        "No other mail follows from this. If you did not request it, ignore this email.",
      ],
    }),
  };
}

export async function sendResumeLink(input: {
  to: string;
  token: string;
  stepsCompleted: number;
}) {
  const resend = getResend();
  if (!resend) return;

  const { error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    ...composeResumeLink(input),
  });
  if (error) console.error("[email] send failed:", error.message);
}

/** Confirms submission to the visitor. */
export function composeSubmissionConfirmation(input: {
  ref: number;
  name: string;
}): ComposedEmail {
  return {
    subject: `Your record is in · REF ${input.ref}`,
    text: [
      `${input.name},`,
      ``,
      `Your six steps are with a broker. They read the record within one business day and confirm which providers fit before anything is quoted. Nothing is shared with a provider until you approve the shortlist.`,
      ``,
      `Something wrong in the record? Reply to this email and it is corrected before quoting starts.`,
    ].join("\n"),
    html: renderEmail({
      preheader: "A broker reads it within one business day.",
      eyebrow: `REF ${input.ref}`,
      heading: "Your record is in",
      bodyHtml:
        para(`${escapeHtml(input.name)},`) +
        para(
          "Your six steps are with a broker. They read the record within one business day and confirm which providers fit before anything is quoted. Nothing is shared with a provider until you approve the shortlist.",
        ),
      footerLines: [
        "Something wrong in the record? Reply to this email and it is corrected before quoting starts.",
      ],
    }),
  };
}

export async function sendSubmissionConfirmation(input: {
  to: string;
  ref: number;
  name: string;
}) {
  const resend = getResend();
  if (!resend) return;

  const { error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    ...composeSubmissionConfirmation(input),
  });
  if (error) console.error("[email] send failed:", error.message);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
