import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests.
 *
 * These exist because the rest of the suite cannot see the thing it is most
 * often asked about. `pnpm check` proves types, lint and pure functions;
 * `next build` proves the routes compile and that `/` is still statically
 * prerendered. None of them can tell you whether a modal traps focus, whether
 * a sticky sidebar actually sticks, or whether a partner's page leaks the
 * house brand. Those are the questions that keep coming back, so they get a
 * runner that opens a real browser.
 *
 * Kept OUT of `pnpm check` on purpose: these need a built app, a live
 * Supabase project and roughly a minute. `pnpm check` is the fast gate that
 * runs on every change, and a slow gate is one people learn to skip.
 * Run them with `pnpm test:e2e`.
 */

/*
  The apex the app is served from in tests.

  This has to agree with NEXT_PUBLIC_APEX_HOST, because lib/tenant/host.ts
  classifies every request by comparing the Host header against it. Tests set
  both from here so they cannot drift apart: a mismatch does not error, it
  silently classifies every partner host as "unknown" and 404s the lot.
*/
const PORT = Number(process.env.PV_E2E_PORT ?? 3210);
export const APEX = `localhost:${PORT}`;

/*
  The partner subdomain under test.

  A slug, not a full host, and it must name a tenant that actually exists in
  whichever Supabase project .env.local points at: resolveTenant() looks it up
  and requireTenant() 404s when it misses. There is no fixture tenant created
  here on purpose, because creating one means writing to a shared project from
  a test run.

  Partner tests skip themselves when this is unset rather than fail, so a
  developer without a seeded tenant still gets the house-site coverage.
*/
export const PARTNER_SLUG = process.env.PV_E2E_PARTNER_SLUG ?? "";

/*
  `*.localhost` resolves to 127.0.0.1 in Chromium with no /etc/hosts entry,
  which is what makes partner subdomains testable at all here. Firefox does
  not do this, which is one reason this project runs Chromium only.
*/
export const partnerHost = (slug: string) => `${slug}.${APEX}`;

export default defineConfig({
  testDir: "./e2e",
  /*
    Fully parallel, but ONE worker by default.

    These tests share a single dev server and, through it, one Supabase
    project. Signed-in console tests mutate rows that other tests read, so
    parallel workers would produce failures that depend on scheduling: the
    worst kind to debug and the fastest way to teach a team to ignore a suite.
  */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: `http://${APEX}`,
    /*
      Artifacts on failure only. A screenshot and a trace turn "the sidebar is
      not sticky" from a claim into something you can open and look at, which
      is the entire point of adding a browser to this project.
    */
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  /*
    `next start`, not `next dev`.

    Dev mode compiles routes on first request, so the first visit to a page
    can take seconds and time out, and it does not exercise the static/dynamic
    split at all. This project has a hard requirement that `/` stays
    prerendered, and only a production build can show whether that holds.

    reuseExistingServer locally: rebuilding for every run would make the suite
    too slow to use during a fix. CI always builds clean.
  */
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://${APEX}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_APEX_HOST: APEX,
      NEXT_PUBLIC_SITE_URL: `http://${APEX}`,
    },
  },
});
