import "server-only";

import { Resend } from "resend";
import { STEPS, formatAnswer, type Answers } from "@/lib/discovery/schema";
import {
  formatFrom,
  houseBrand,
  parseSender,
  type EmailBrand,
} from "@/lib/tenant/email-brand";

/*
  ============================================================================
  Who the mail is from.

  EMAIL_FROM holds the ONE verified sender. Its display name is the house
  brand; its address is what Resend has verified and is never changed per
  tenant. fromFor() swaps only the display name, so a lead who submits on a
  partner's portal sees "Acme Brokers <notifications@...>" and a reply goes
  to the partner's own address through reply-to. See lib/tenant/email-brand.ts
  for why per-partner sending domains were not the answer.
  ============================================================================
*/

const SENDER = parseSender(process.env.EMAIL_FROM);

function fromFor(brand: EmailBrand): string {
  return formatFrom(brand.name, SENDER);
}

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

/*
  ============================================================================
  The shared template.

  Email HTML is written for the clients people actually use, which means
  tables, inline styles, and system fonts. The rules this file follows and
  why:

  - Layout is nested tables, not flex or grid. Outlook renders with Word's
    engine and knows nothing else. The column is fluid (width 100%, max
    560px) so it fits a phone; Outlook alone gets a fixed 560 via MSO.
  - The mark is a hosted PNG, not the site's inline SVG: Gmail strips <svg>
    and Outlook cannot render SVG images at all. The wordmark next to it is
    live text, so when a client blocks remote images the header still says
    who the mail is from instead of showing a broken-image square. A partner
    logo renders the same way, from the public tenant-logos bucket.
  - System font stack rather than the site's webfonts. Webfont support in
    mail clients is poor enough that designing around it means designing for
    the fallback anyway, and the system stack is the honest version of the
    clean look this template is after.
  - Colours are the brand tokens from app/globals.css, hardcoded because
    email has no stylesheet: navy #19233B, soft ink #3E465A, muted #63697A,
    faint #808693, line #E1E2E6, sunken #F5F5F6, orange #FF2D00. A partner's
    validated accent and ink replace the orange and the navy; the greys stay,
    because they are neutral and derived. The accent appears only on the
    button with a bold white label, matching the contrast rule in the brand
    guide.
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

const HOUSE_INK = "#19233B";
const HOUSE_ACCENT = "#FF2D00";

/*
  Type scale and greys, used everywhere below so the messages read as one
  family: 12 eyebrow, 13 footer, 14 label, 16 body, 24 heading. Greys are the
  navy-mixed tokens from globals.css; a partner's ink replaces only the navy.
*/
const INK_SOFT = "#3E465A";
const INK_MUTED = "#63697A";
const INK_FAINT = "#808693";
const LINE = "#E6E7EB";
const LINE_SOFT = "#EEF0F3";
const CANVAS = "#F4F5F7";

/** Header mark plus live wordmark. */
function renderHeader(brand: EmailBrand): string {
  const ink = brand.ink ?? HOUSE_INK;
  const markHeight = 28;
  const mark = brand.logo
    ? `<td style="vertical-align:middle;padding-right:10px;">
                    <img src="${brand.logo.url}" width="${Math.max(1, Math.round((brand.logo.width / brand.logo.height) * markHeight))}" height="${markHeight}" alt="" style="display:block;border:0;height:${markHeight}px;width:auto;" />
                  </td>`
    : "";
  /*
    House: the spaced small-caps lockup from the site. Partner: their name as
    a plain bold wordmark, larger, because without a mark the name IS the
    identity and 13px tracking-out text reads as a caption, not a brand.
  */
  const wordmark = brand.isHouse
    ? `<span style="font-size:13px;letter-spacing:.08em;">PRIME&nbsp;<span style="font-weight:700;">PEO</span>&nbsp;BROKERS</span>`
    : `<span style="font-size:${brand.logo ? 14 : 16}px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(brand.name)}</span>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${mark}
                  <td style="vertical-align:middle;font-family:${FONT};line-height:1;color:${ink};white-space:nowrap;">
                    ${wordmark}
                  </td>
                </tr>
              </table>`;
}

function renderEmail(opts: {
  brand: EmailBrand;
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
  const ink = opts.brand.ink ?? HOUSE_INK;
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${MONO};font-size:12px;line-height:1.4;letter-spacing:.12em;text-transform:uppercase;color:${INK_MUTED};">${opts.eyebrow}</p>`
    : "";

  /*
    Width: `width:100%; max-width:560px` on the inner table, never a fixed
    560. A fixed width inside a shrink-to-fit centred cell wins over
    max-width:100% and the card runs off a phone screen (verified in a
    375px render). Outlook ignores max-width, so it gets a fixed 560 through
    the MSO conditional instead.

    The <style> block only tightens padding on narrow screens. Every value it
    overrides is also set inline, so a client that strips <style> (older
    Gmail, some Outlooks) still renders the desktop layout correctly.
  */
  return `<!doctype html>
<html lang="en">
<head>
  <!-- Without an explicit charset, any client that ignores the transport
       header renders the middle dots and typographic quotes as mojibake. -->
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <style>
    @media only screen and (max-width: 600px) {
      .pv-outer { padding: 20px 12px 28px !important; }
      .pv-card { padding: 28px 22px !important; }
      .pv-head { padding: 0 4px 18px !important; }
      .pv-foot { padding: 20px 4px 0 !important; }
      .pv-h1 { font-size: 22px !important; }
      .pv-label { width: 42% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
    <tr>
      <td class="pv-outer" align="center" style="padding:36px 16px 44px;">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;">

          <tr>
            <td class="pv-head" style="padding:0 6px 20px;">
              ${renderHeader(opts.brand)}
            </td>
          </tr>

          <tr>
            <td class="pv-card" style="background-color:#FFFFFF;border:1px solid ${LINE};border-radius:12px;padding:40px 40px 36px;">
              ${eyebrow}
              <h1 class="pv-h1" style="margin:0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${ink};">${opts.heading}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>

          <tr>
            <td class="pv-foot" style="padding:22px 6px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_FAINT};">
              <p style="margin:0 0 6px;font-weight:600;color:${INK_MUTED};">${escapeHtml(opts.brand.name)}</p>
              ${opts.footerLines.map((l) => `<p style="margin:0 0 4px;">${l}</p>`).join("")}
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A body paragraph in the card. */
function para(html: string): string {
  return `<p style="margin:16px 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK_SOFT};">${html}</p>`;
}

/** Small muted paragraph: the "or paste this link" line. */
function small(html: string): string {
  return `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_FAINT};word-break:break-all;">${html}</p>`;
}

/** The one place the accent appears: a button with a bold white label. */
function button(brand: EmailBrand, href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
      <tr>
        <td style="background-color:${brand.accent ?? HOUSE_ACCENT};border-radius:8px;">
          <a href="${href}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:600;color:#FFFFFF;text-decoration:none;">${label}</a>
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

/**
 * The Resend payload for one message.
 *
 * reply-to: omitted means the brand's own address; a string overrides it (a
 * lead alert replies to the lead, not to the partner who received it); null
 * means none at all (security codes and invites). null rather than undefined
 * because an explicit undefined would take the default.
 */
function payload(
  brand: EmailBrand,
  to: string,
  composed: ComposedEmail,
  replyTo?: string | null,
) {
  const rt = replyTo === undefined ? brand.replyTo : replyTo ?? undefined;
  return {
    from: fromFor(brand),
    to,
    ...(rt ? { replyTo: rt } : {}),
    ...composed,
  };
}

/**
 * Tells someone a new record was submitted.
 *
 * The same message serves two readers with different links and framing: the
 * house team (console link, "via <partner>" when it came through a portal)
 * and the partner (portal link, no "via", because to them it is simply their
 * lead).
 */
export function composeSubmissionNotification(input: {
  ref: number;
  id: string;
  answers: Answers;
  brand: EmailBrand;
  /** Where "Open REF n" goes. */
  link: string;
  /** The partner the lead came through. House copy only. */
  via?: string;
  /**
   * "record" (default) is a finished discovery record. "call" is the short
   * "talk to a broker first" form: same row shape, but the team should read
   * it as a phone call to make, not a record to price.
   */
  kind?: "record" | "call";
  footer: string;
}): ComposedEmail {
  const company = formatAnswer("company", input.answers);
  const contact = formatAnswer("fullName", input.answers);
  const email = formatAnswer("email", input.answers);
  const isCall = input.kind === "call";
  // A call request often has no company yet; the person's name carries it.
  const who = company === "–" ? contact : company;
  const headline = isCall ? "Call requested" : "New lead";
  const ink = input.brand.ink ?? HOUSE_INK;

  /*
    The full record travels in the mail on purpose: the person triaging reads
    it from their inbox on a phone and decides whether it can wait, without a
    sign-in round trip. Muted labels, ink values, a hairline between steps.
  */
  /*
    Label column fixed at 40% and allowed to wrap, so the longest question
    ("Which states do you employ people in?") never widens the table past a
    phone screen. One hairline per row keeps a 30-row record scannable, and
    an unanswered field is rendered faint so the eye lands on the answers.
  */
  const sections = STEPS.map((step) => {
    const rows = step.fields
      .map((f, i) => {
        const value = formatAnswer(f.id, input.answers);
        const empty = value === "–";
        const border = i === step.fields.length - 1 ? "" : `border-bottom:1px solid ${LINE_SOFT};`;
        return `
        <tr>
          <td class="pv-label" width="40%" style="width:40%;padding:8px 16px 8px 0;${border}font-family:${FONT};font-size:14px;line-height:1.5;color:${INK_MUTED};vertical-align:top;">${escapeHtml(f.label)}</td>
          <td style="padding:8px 0;${border}font-family:${FONT};font-size:15px;line-height:1.5;color:${empty ? INK_FAINT : ink};vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`;
      })
      .join("");
    return `
      <p style="margin:32px 0 4px;padding-top:24px;border-top:1px solid ${LINE};font-family:${MONO};font-size:11.5px;line-height:1.4;letter-spacing:.12em;text-transform:uppercase;color:${INK_MUTED};">${escapeHtml(step.title)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
  }).join("");

  const viaText = input.via ? ` · via ${input.via}` : "";
  const text = [
    `${headline}: ${who}${viaText}`,
    `${contact} (${email})`,
    ``,
    `Open REF ${input.ref}: ${input.link}`,
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
    subject: `${isCall ? "Call request" : "New discovery record"} · REF ${input.ref} · ${who}${viaText}`,
    text,
    html: renderEmail({
      brand: input.brand,
      preheader: `${company} · ${contact}`,
      eyebrow: `REF ${input.ref}${input.via ? ` · via ${escapeHtml(input.via)}` : ""}`,
      heading: `${headline}: ${escapeHtml(who)}`,
      bodyHtml:
        `<p style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK_MUTED};">${escapeHtml(contact)} · ${escapeHtml(email)}</p>` +
        button(input.brand, input.link, `Open REF ${input.ref}`) +
        sections,
      footerLines: [input.footer],
    }),
  };
}

/**
 * Notifies everyone who should know about a new record.
 *
 * Two messages, both best-effort and independent of each other:
 *
 *   1. The house team, always, at LEAD_NOTIFY_EMAIL, in the house brand with
 *      a console link. A lead from a partner portal is marked "via <partner>"
 *      so the team knows the source without opening the record.
 *   2. The partner, when the record came through a portal and the partner
 *      has a contact address, in their own brand with a link to the lead in
 *      their portal.
 *
 * Reply-to on both is the lead's own address, when they gave one: replying
 * to the alert reaches the person who filled in the form.
 */
export async function sendSubmissionNotification(input: {
  ref: number;
  id: string;
  answers: Answers;
  brand: EmailBrand;
  /** See composeSubmissionNotification. */
  kind?: "record" | "call";
}) {
  const resend = getResend();
  if (!resend) return;

  const leadEmail = input.answers["email"];
  const replyTo =
    typeof leadEmail === "string" && leadEmail.includes("@") ? leadEmail : undefined;

  const sends: Promise<{ error: { message: string } | null }>[] = [];

  const house = houseBrand();
  const houseTo = process.env.LEAD_NOTIFY_EMAIL?.trim();
  if (houseTo) {
    sends.push(
      resend.emails.send(
        payload(
          house,
          houseTo,
          composeSubmissionNotification({
            ref: input.ref,
            id: input.id,
            answers: input.answers,
            brand: house,
            kind: input.kind,
            link: `${house.origin}/console/leads/${input.id}`,
            via: input.brand.isHouse ? undefined : input.brand.name,
            footer: "Sent to the team the moment a discovery record is submitted.",
          }),
          replyTo ?? house.replyTo,
        ),
      ),
    );
  } else {
    console.warn("[email] LEAD_NOTIFY_EMAIL is not set: the team was not told about this lead.");
  }

  if (!input.brand.isHouse) {
    if (input.brand.replyTo) {
      sends.push(
        resend.emails.send(
          payload(
            input.brand,
            input.brand.replyTo,
            composeSubmissionNotification({
              ref: input.ref,
              id: input.id,
              answers: input.answers,
              brand: input.brand,
              kind: input.kind,
              link: `${input.brand.origin}/portal/leads/${input.id}`,
              footer: "Sent to you the moment a lead submits through your portal.",
            }),
            replyTo,
          ),
        ),
      );
    } else {
      console.warn(
        `[email] partner "${input.brand.name}" has no contact address: their copy of REF ${input.ref} was skipped.`,
      );
    }
  }

  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === "rejected") console.error("[email] send failed:", r.reason);
    else if (r.value.error) console.error("[email] send failed:", r.value.error.message);
  }
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
  brand: EmailBrand;
}): ComposedEmail {
  const code = escapeHtml(input.code);
  const ink = input.brand.ink ?? HOUSE_INK;
  return {
    // The code goes in the subject too: on a phone it is readable from the
    // notification without opening the message.
    subject: `Your ${input.brand.name} reset code is ${input.code}`,
    text: [
      `Your reset code is ${input.code}`,
      ``,
      `Enter it to set a new password. It expires in ${input.expiresInMinutes} minutes and works once. Asking for another code cancels this one.`,
      ``,
      `If you did not ask for this, ignore this email. Your password has not changed, and nobody can use the code without your inbox.`,
    ].join("\n"),
    html: renderEmail({
      brand: input.brand,
      preheader: `Expires in ${input.expiresInMinutes} minutes.`,
      heading: "Your reset code",
      bodyHtml:
        para("Enter this code to set a new password.") +
        `<div style="margin:24px 0 0;background-color:${CANVAS};border:1px solid ${LINE_SOFT};border-radius:10px;padding:22px;text-align:center;">
           <span style="font-family:${MONO};font-size:36px;line-height:1.2;font-weight:600;letter-spacing:.16em;color:${ink};">${code}</span>
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
  brand: EmailBrand;
}): Promise<{ ok: boolean }> {
  const resend = getResend();
  if (!resend) return { ok: false };

  // No reply-to: a reply to a security code should not land in anyone's
  // shared inbox.
  const { error } = await resend.emails.send(
    payload(input.brand, input.to, composePasswordResetCode(input), null),
  );
  if (error) {
    console.error("[email] reset code delivery failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Emails the visitor a link that returns them to the step they left.
 *
 * The link is built on the BRAND's origin, not the house one. A draft saved
 * on a partner's subdomain belongs to that partner's tenant, and the guarded
 * load filters on the tenant of the host it runs on, so a link back to the
 * apex would report the draft missing.
 */
export function composeResumeLink(input: {
  token: string;
  stepsCompleted: number;
  brand: EmailBrand;
}): ComposedEmail {
  const link = `${input.brand.origin}/discovery?r=${input.token}`;
  return {
    subject: `Your ${input.brand.name} discovery record: pick up where you left off`,
    text: [
      `You are ${input.stepsCompleted} of 6 steps in, and everything you entered is saved.`,
      ``,
      `Return to your record: ${link}`,
      ``,
      `The link takes you back to the step you left and expires in 30 days. No other mail follows from this. If you did not request it, ignore this email.`,
    ].join("\n"),
    html: renderEmail({
      brand: input.brand,
      preheader: `${input.stepsCompleted} of 6 steps saved.`,
      heading: "Pick up where you left off",
      bodyHtml:
        para(
          `You are ${input.stepsCompleted} of 6 steps in, and everything you entered is saved.`,
        ) +
        button(input.brand, link, "Continue your record") +
        small(`Or paste this into your browser:<br/><a href="${link}" style="color:${INK_MUTED};">${link}</a>`),
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
  brand: EmailBrand;
}) {
  const resend = getResend();
  if (!resend) return;

  const { error } = await resend.emails.send(
    payload(input.brand, input.to, composeResumeLink(input)),
  );
  if (error) console.error("[email] send failed:", error.message);
}

/** Confirms submission to the visitor. */
export function composeSubmissionConfirmation(input: {
  ref: number;
  name: string;
  brand: EmailBrand;
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
      brand: input.brand,
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
  brand: EmailBrand;
}) {
  const resend = getResend();
  if (!resend) return;

  const { error } = await resend.emails.send(
    payload(input.brand, input.to, composeSubmissionConfirmation(input)),
  );
  if (error) console.error("[email] send failed:", error.message);
}

/**
 * Invites someone to the console or to a partner portal.
 *
 * Sent through Resend rather than Supabase's mailer, for the same reasons as
 * the reset code: the brand's own sender and template instead of
 * "Supabase Auth <noreply@mail.app.supabase.io>", and no per-hour cap. The
 * accept link comes from auth.admin.generateLink, so the token and the
 * acceptance flow are exactly what the stock mailer would have sent.
 *
 * `destination` changes the copy, because the two surfaces are different
 * products: staff join a console where the team works leads, a partner joins
 * a portal where they see the leads that came through their site.
 *
 * Delivery is reported like the reset code: the caller creates an auth user
 * before sending, and has to know whether to keep it.
 */
export function composeTeamInvite(input: {
  acceptUrl: string;
  invitedBy: string;
  role: "admin" | "member";
  brand: EmailBrand;
  destination: "console" | "portal";
}): ComposedEmail {
  const inviter = escapeHtml(input.invitedBy);
  const name = input.brand.name;

  const intro =
    input.destination === "portal"
      ? `invited you to the ${name} portal, where you can see the leads that come through your site and where each one stands.`
      : `invited you to the ${name} console, where the team works incoming leads.`;
  const roleLine =
    input.destination === "portal"
      ? ""
      : input.role === "admin"
        ? " You are joining as an admin, so you can also manage the team and the pipeline."
        : " You are joining as a team member.";

  return {
    subject: `${input.invitedBy} invited you to ${name}`,
    text: [
      `${input.invitedBy} ${intro}${roleLine}`,
      ``,
      `Accept the invitation and set your password: ${input.acceptUrl}`,
      ``,
      `The link works once. If it has expired by the time you use it, ask to be invited again.`,
      `Not expecting this? Ignore this email and nothing happens.`,
    ].join("\n"),
    html: renderEmail({
      brand: input.brand,
      preheader: "Accept to set your password.",
      heading: "You're invited",
      bodyHtml:
        para(`${inviter} ${escapeHtml(intro)}${escapeHtml(roleLine)}`) +
        button(input.brand, input.acceptUrl, "Accept invitation") +
        small(`Or paste this into your browser:<br/><a href="${input.acceptUrl}" style="color:${INK_MUTED};">${input.acceptUrl}</a>`),
      footerLines: [
        "The link works once and takes you straight to setting a password. If it has expired by the time you use it, ask to be invited again.",
        "Not expecting this? Ignore this email and nothing happens.",
      ],
    }),
  };
}

export async function sendTeamInvite(input: {
  to: string;
  acceptUrl: string;
  invitedBy: string;
  role: "admin" | "member";
  brand: EmailBrand;
  destination: "console" | "portal";
}): Promise<{ ok: boolean }> {
  const resend = getResend();
  if (!resend) return { ok: false };

  // No reply-to: an invite is not a conversation, and a reply should not
  // land in a shared inbox.
  const { error } = await resend.emails.send(
    payload(input.brand, input.to, composeTeamInvite(input), null),
  );
  if (error) {
    console.error("[email] invite delivery failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Exported for the preview script and the unit tests. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
