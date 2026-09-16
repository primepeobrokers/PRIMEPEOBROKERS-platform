/**
 * Sends every transactional email through the real Resend path, with the
 * sender and site URL from an env file, to ONE address you name. Nothing is
 * written to the database and nobody else is mailed: the "house inbox" copy
 * of the lead notification is redirected to the same recipient.
 *
 * Run:
 *   npx tsx --conditions=react-server scripts/send-test-emails.mts you@example.com
 *   npx tsx --conditions=react-server scripts/send-test-emails.mts you@example.com .env.local
 *
 * Defaults to .env.production.local, because the point is to prove the
 * production sender domain is verified and the templates render from the
 * production origin. --conditions=react-server gets past lib/email.ts's
 * "server-only" guard, the same trick preview-email.mts uses.
 */
import { loadEnv } from "./lib/harness";

const to = process.argv[2];
if (!to || !to.includes("@")) {
  console.error("usage: send-test-emails.mts recipient@example.com [env file]");
  process.exit(1);
}
const envFile = process.argv[3] ?? ".env.production.local";
const env = loadEnv(envFile);
if (!env.RESEND_API_KEY) {
  console.error(`${envFile}: RESEND_API_KEY missing or file not found`);
  process.exit(1);
}
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APEX_HOST"]) {
  if (env[k]) process.env[k] = env[k];
}
// Every copy goes to the recipient, including the one meant for the team.
process.env.LEAD_NOTIFY_EMAIL = to;

// Imported after the env is set: lib/email.ts reads EMAIL_FROM at load time.
const email = await import("../lib/email");
const { houseBrand } = await import("../lib/tenant/email-brand");
const brand = houseBrand();

console.log(`env:     ${envFile}`);
console.log(`sender:  ${process.env.EMAIL_FROM}`);
console.log(`origin:  ${brand.origin}`);
console.log(`to:      ${to}\n`);

// The senders report failures through console.error rather than a return
// value, so capture that channel per send.
const errors: string[] = [];
const realError = console.error;
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(" "));
};

const answers = {
  category: "peo",
  fullName: "Test Recipient",
  email: to,
  company: "Send Test Co",
  employeeCount: "26-100",
  fte: "15",
  provider: "TriNet",
  fee: "48000",
  benefitsOffered: "yes",
  benefitTypes: ["Medical", "Dental"],
  drivers: "Cost",
  timeline: "1-3 months",
  contactPreference: "call",
  renewalDate: "2027-01-31",
};
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

const sends: [string, () => Promise<unknown>][] = [
  ["resume link", () => email.sendResumeLink({ to, token: FAKE_ID, stepsCompleted: 3, brand })],
  ["submission confirmation", () => email.sendSubmissionConfirmation({ to, ref: 9999, name: "Test Recipient", brand })],
  ["call request confirmation", () => email.sendSubmissionConfirmation({ to, ref: 9998, name: "Test Recipient", brand, kind: "call" })],
  ["lead notification (record)", () => email.sendSubmissionNotification({ ref: 9999, id: FAKE_ID, answers, brand })],
  [
    "lead notification (call request)",
    () =>
      email.sendSubmissionNotification({
        ref: 9998,
        id: FAKE_ID,
        answers: { fullName: "Test Recipient", email: to, phone: "(555) 123-4567", notes: "Renewal in March.", contactPreference: "call" },
        brand,
        kind: "call",
      }),
  ],
  ["password reset code", () => email.sendPasswordResetCode({ to, code: "123456", expiresInMinutes: 10, brand })],
  [
    "team invite",
    () =>
      email.sendTeamInvite({
        to,
        acceptUrl: `${brand.origin}/login?welcome=1`,
        invitedBy: "Send Test",
        role: "member",
        brand,
        destination: "console",
      }),
  ],
];

let failed = 0;
for (const [name, run] of sends) {
  const before = errors.length;
  try {
    const result = await run();
    const logged = errors.slice(before);
    const notOk = typeof result === "object" && result !== null && "ok" in result && !(result as { ok: boolean }).ok;
    if (logged.length || notOk) {
      failed++;
      console.log(`FAIL  ${name}`);
      for (const l of logged) console.log(`      ${l}`);
    } else {
      console.log(`sent  ${name}`);
    }
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${(e as Error).message}`);
  }
  // Resend allows two requests a second.
  await new Promise((r) => setTimeout(r, 700));
}

console.error = realError;
console.log(failed === 0 ? `\nall ${sends.length} sent` : `\n${failed} of ${sends.length} failed`);
process.exit(failed === 0 ? 0 : 1);
