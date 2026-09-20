import { test as base, expect, type Page } from "@playwright/test";

import { APEX, PARTNER_SLUG, partnerHost } from "../playwright.config";

export { expect };

/**
 * Shared fixtures and small helpers for the browser suite.
 *
 * The helpers here all exist to stop a test asserting something weaker than
 * it appears to. `expectNoHouseBrand` is the clearest case: the obvious
 * version greps the HTML for "Prime PEO Brokers", which would fail on the
 * footer attribution line that is SUPPOSED to be there, so every partner test
 * would have been written around a false failure.
 */

/** The house brand, spelled as it appears in copy. */
export const HOUSE_NAME = "Prime PEO Brokers";
export const HOUSE_EMAIL = "admin@primepeobrokers.com";

export const test = base;

/** Credentials for signed-in coverage, absent by default. */
export const CREDS = {
  email: process.env.PV_E2E_EMAIL ?? "",
  password: process.env.PV_E2E_PASSWORD ?? "",
};

export const hasCreds = () => Boolean(CREDS.email && CREDS.password);
export const hasPartner = () => Boolean(PARTNER_SLUG);

/**
 * A URL on the partner subdomain.
 *
 * Takes a path rather than being a bare host so no test has to remember the
 * scheme or the port, both of which change with PV_E2E_PORT.
 */
export function partnerUrl(path = "/"): string {
  return `http://${partnerHost(PARTNER_SLUG)}${path}`;
}

export function apexUrl(path = "/"): string {
  return `http://${APEX}${path}`;
}

/**
 * Asserts the house brand does not appear in the page's VISIBLE text, with
 * the deliberate exceptions allowed through.
 *
 * Two things make the naive version wrong.
 *
 * First, a partner page is REQUIRED to name Prime once, in the footer
 * attribution ("Brokerage services provided by Prime PEO Brokers") and in the
 * legal links, which stay Prime's because Prime is the data controller. A
 * test that forbids the string outright fails on correct behaviour.
 *
 * Second, textContent() would include text inside `display:none` elements and
 * `<script>` payloads. Next inlines the RSC flight data into the document, and
 * that payload contains component props verbatim, so the house name is
 * present in the HTML source of a perfectly clean partner page. Only
 * `innerText` reflects what a human can actually read.
 */
export async function expectNoHouseBrand(page: Page) {
  const visible = await page.evaluate(() => document.body.innerText);

  const offending = visible
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(HOUSE_NAME))
    // The one line that must name Prime: the attribution.
    .filter((l) => !/brokerage services provided by/i.test(l));

  expect(
    offending,
    `Partner page leaked the house brand in visible text:\n${offending.join("\n")}`,
  ).toEqual([]);

  expect(
    visible,
    "Partner page exposed the house support address",
  ).not.toContain(HOUSE_EMAIL);
}

/**
 * Signs in through the real form.
 *
 * Deliberately not a storageState shortcut that mints a session with the
 * service-role key. Signing in is itself one of the flows worth covering, and
 * a fabricated cookie would skip the proxy's session refresh and the
 * redirect-after-login logic, which is where the bugs in this area have
 * actually been.
 */
export async function signIn(page: Page, path = "/console") {
  await page.goto(apexUrl(`/login?next=${encodeURIComponent(path)}`));
  await page.getByLabel("Work email").fill(CREDS.email);
  await page.getByLabel("Password", { exact: true }).fill(CREDS.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

/**
 * How far an element has been scrolled out of the viewport's top.
 *
 * A sticky element's bounding box stays put as the page scrolls; a static one
 * moves up by the scroll distance. Comparing the box before and after a
 * scroll is the only honest way to test `position: sticky`, because the
 * computed style says "sticky" whether or not it has an offset to stick to.
 */
export async function topAfterScroll(page: Page, selector: string, by: number) {
  const before = await page.locator(selector).boundingBox();
  await page.mouse.wheel(0, by);
  await page.waitForTimeout(250);
  const after = await page.locator(selector).boundingBox();
  return { before: before?.y ?? 0, after: after?.y ?? 0 };
}
