/**
 * Renders every email in the house brand and in a fake partner brand, and
 * writes them as HTML files to look at in a browser. Nothing is sent.
 *
 * Run: pnpm email:preview [out-dir]
 *
 * lib/email.ts is marked "server-only", which throws under plain Node. The
 * package exposes an empty module under the `react-server` condition, so the
 * pnpm script passes --conditions=react-server; that is the whole trick.
 *
 * Default output is .preview-email/ in the repo (gitignored). A dedicated
 * directory rather than the OS temp dir so `open .preview-email` works after
 * every run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  composePasswordResetCode,
  composeResumeLink,
  composeSubmissionConfirmation,
  composeSubmissionNotification,
  composeTeamInvite,
  type ComposedEmail,
} from "../lib/email";
import { brandFor, houseBrand, type EmailBrand } from "../lib/tenant/email-brand";
import { parseBranding } from "../lib/tenant/branding";
import type { Answers } from "../lib/discovery/schema";

const outDir = process.argv[2] ?? ".preview-email";
mkdirSync(outDir, { recursive: true });

const answers: Answers = {
  category: "payroll",
  company: "Northwind Traders",
  fullName: "Jordan Lee",
  email: "jordan@northwind.example",
  phone: "555 0100",
  headcount: "26–50",
  states: ["TX", "CO"],
  drivers: ["Cost", "Compliance"],
  timeline: "This quarter",
};

const house = houseBrand();
const partner: EmailBrand = brandFor({
  slug: "acme",
  name: "Acme Brokers LLC",
  isHouse: false,
  branding: parseBranding(
    {
      companyName: "Acme Brokers",
      supportEmail: "ops@acme.example",
      colors: { accent: "#0b5fff", ink: "#0f1a2b", dark: "#0f1a2b" },
    },
    "Acme Brokers LLC",
  ),
});
// A partner with no branding at all: what day one looks like.
const bare: EmailBrand = brandFor({
  slug: "bare",
  name: "Bare Brokerage",
  isHouse: false,
  branding: parseBranding({}, "Bare Brokerage"),
});

const messages: Record<string, ComposedEmail> = {
  "house-notification": composeSubmissionNotification({
    ref: 1087, id: "00000000-0000-4000-8000-000000000042", answers, brand: house,
    link: `${house.origin}/console/leads/00000000-0000-4000-8000-000000000042`,
    via: "Acme Brokers",
    footer: "Sent to the team the moment a discovery record is submitted.",
  }),
  "partner-notification": composeSubmissionNotification({
    ref: 1087, id: "00000000-0000-4000-8000-000000000042", answers, brand: partner,
    link: `${partner.origin}/portal/leads/00000000-0000-4000-8000-000000000042`,
    footer: "Sent to you the moment a lead submits through your portal.",
  }),
  "house-confirmation": composeSubmissionConfirmation({ ref: 1087, name: "Jordan", brand: house }),
  "partner-confirmation": composeSubmissionConfirmation({ ref: 1087, name: "Jordan", brand: partner }),
  "bare-confirmation": composeSubmissionConfirmation({ ref: 1087, name: "Jordan", brand: bare }),
  "house-resume": composeResumeLink({ token: "tok", stepsCompleted: 3, brand: house }),
  "partner-resume": composeResumeLink({ token: "tok", stepsCompleted: 3, brand: partner }),
  "house-reset": composePasswordResetCode({ code: "48213976", expiresInMinutes: 15, brand: house }),
  "partner-reset": composePasswordResetCode({ code: "48213976", expiresInMinutes: 15, brand: partner }),
  "house-invite": composeTeamInvite({
    acceptUrl: `${house.origin}/auth/confirm?token_hash=x&type=invite`,
    invitedBy: "Sam Rivera", role: "member", brand: house, destination: "console",
  }),
  "partner-invite": composeTeamInvite({
    acceptUrl: `${partner.origin}/auth/confirm?token_hash=x&type=invite`,
    invitedBy: "Sam Rivera", role: "admin", brand: partner, destination: "portal",
  }),
};

const index: string[] = [];
for (const [name, m] of Object.entries(messages)) {
  writeFileSync(join(outDir, `${name}.html`), m.html);
  writeFileSync(join(outDir, `${name}.txt`), `Subject: ${m.subject}\n\n${m.text}`);
  index.push(`<li><a href="${name}.html">${name}</a> <code>${m.subject.replace(/</g, "&lt;")}</code></li>`);
}
writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><ul>${index.join("")}</ul>`,
);
console.log(`preview-email: ${Object.keys(messages).length} messages in ${outDir}/ (open ${outDir}/index.html)`);
