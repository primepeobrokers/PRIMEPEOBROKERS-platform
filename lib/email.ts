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

/** Notifies the client's team that a new record was submitted. */
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

  const company = formatAnswer("company", input.answers);
  const contact = formatAnswer("fullName", input.answers);
  const email = formatAnswer("email", input.answers);
  const consoleLink = `${siteUrl()}/console/leads/${input.id}`;

  const sections = STEPS.map((step) => {
    const rows = step.fields
      .map(
        (f) =>
          `<tr><td style="padding:6px 16px 6px 0;color:#63697A;font-size:14px;vertical-align:top;">${f.label}</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(formatAnswer(f.id, input.answers))}</td></tr>`,
      )
      .join("");
    return `<h3 style="font-size:15px;margin:20px 0 4px;">${step.title}</h3><table style="border-collapse:collapse;">${rows}</table>`;
  }).join("");

  await resend.emails.send({
    from: FROM,
    to,
    subject: `New discovery record · REF ${input.ref} · ${company}`,
    html: `
      <div style="font-family:system-ui,sans-serif;color:#19233B;max-width:640px;">
        <p style="font-size:15px;">A new record just came through the discovery flow.</p>
        <p style="font-size:15px;"><strong>${escapeHtml(company)}</strong>: ${escapeHtml(contact)} (${escapeHtml(email)})</p>
        <p><a href="${consoleLink}" style="color:#FF2D00;">Open REF ${input.ref} in the console</a></p>
        ${sections}
      </div>`,
  });
}

/** Emails the visitor a link that returns them to the step they left. */
export async function sendResumeLink(input: {
  to: string;
  token: string;
  stepsCompleted: number;
}) {
  const resend = getResend();
  if (!resend) return;

  const link = `${siteUrl()}/discovery?r=${input.token}`;
  await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: "Your Prime PEO Brokers discovery record: pick up where you left off",
    html: `
      <div style="font-family:system-ui,sans-serif;color:#19233B;max-width:560px;">
        <p style="font-size:15px;">You are ${input.stepsCompleted} of 6 steps in. Your answers are saved.</p>
        <p style="font-size:15px;"><a href="${link}" style="color:#FF2D00;">Return to your record</a>. This link takes you back to the step you left and expires in 30 days.</p>
        <p style="font-size:13px;color:#63697A;">No other mail follows from this. If you did not request the link, ignore this email.</p>
      </div>`,
  });
}

/** Confirms submission to the visitor. */
export async function sendSubmissionConfirmation(input: {
  to: string;
  ref: number;
  name: string;
}) {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: `Your record is in · REF ${input.ref}`,
    html: `
      <div style="font-family:system-ui,sans-serif;color:#19233B;max-width:560px;">
        <p style="font-size:15px;">${escapeHtml(input.name)},</p>
        <p style="font-size:15px;">Your six steps are with a broker. They read the record within one business day and will confirm which providers fit before anything is quoted. Nothing is shared with a provider until you approve the shortlist.</p>
        <p style="font-size:13px;color:#63697A;">Something wrong in the record? Reply to this email and it is corrected before quoting starts.</p>
      </div>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
