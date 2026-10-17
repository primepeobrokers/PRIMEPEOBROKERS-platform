import { PARTNER_SLUG } from "../playwright.config";
import {
  apexUrl,
  expect,
  expectNoHouseBrand,
  hasPartner,
  HOUSE_NAME,
  partnerUrl,
  test,
} from "./helpers";

/**
 * White-label: a partner's public page must carry the partner's brand and
 * must not solicit business for the house.
 *
 * This is the highest-stakes area in the app that had no automated coverage,
 * because every check that could catch a leak needs a rendered page. A single
 * missed string here is visible to the partner's own prospects on the
 * partner's own domain.
 */
test.describe("partner branded homepage", () => {
  test.skip(!hasPartner(), "set PV_E2E_PARTNER_SLUG to a seeded tenant slug");

  /*
    /partner-home, not /.

    The proxy rewrites / to /partner-home on a partner host, but its matcher
    host pattern is a production literal, so locally the rewrite never fires
    and / serves the house page. Requesting the rewrite TARGET tests the page
    itself, which is the part that can leak a brand. That the rewrite is wired
    up is asserted separately in proxy-routing.spec.ts against the source.
  */
  test("renders in the partner's brand with no house solicitation", async ({
    page,
  }) => {
    await page.goto(partnerUrl("/partner-home"));

    // The referral pitch sells the house's partner programme. On a partner's
    // own site it would be Prime advertising to the partner's clients.
    await expect(page.getByText("For partners", { exact: false })).toHaveCount(0);

    await expectNoHouseBrand(page);
  });

  test("names the partner in the browser tab", async ({ page }) => {
    await page.goto(partnerUrl("/partner-home"));

    const title = await page.title();

    /*
      The root layout's metadata uses a title TEMPLATE that appends the house
      name, so a partner page that merely sets `title` still renders
      "... · Prime PEO Brokers" in the tab and in a shared link. Bypassing it
      needs `title: { absolute }`, and nothing but reading the rendered title
      can confirm it was done.
    */
    expect(title).not.toContain(HOUSE_NAME);
    expect(title.toLowerCase()).toContain(PARTNER_SLUG.split("-")[0]!.toLowerCase());
  });

  test("keeps the attribution and the legal links pointing at the house", async ({
    page,
  }) => {
    await page.goto(partnerUrl("/partner-home"));

    /*
      The inverse of the leak test, and the reason expectNoHouseBrand carries
      an exception. A partner may not imply they hold the brokerage licence,
      so the footer must say who actually performs the work, and privacy and
      terms must stay the house's because the house is the data controller.
      Stripping these would be a compliance failure, not a branding win.
    */
    await expect(
      page.getByText(/services provided by A&G Advisors, LLC d\/b\/a Prime PEO Brokers/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/is a referral partner; the PEO and HCM evaluation is performed by Prime/).first()).toBeVisible();
    await expect(page.getByText("© A&G Advisors, LLC d/b/a Prime PEO Brokers")).toBeVisible();

    await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
    await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
  });

  test("names the partner on the sign-in screen", async ({ page }) => {
    await page.goto(partnerUrl("/login"));

    // "Broker console" and "For Prime PEO Brokers staff" were the last
    // white-label leak on this screen. first(): the phrase legitimately
    // appears twice, on the card eyebrow and in the aside beside it.
    await expect(page.getByText("Partner portal").first()).toBeVisible();
    await expect(page.getByText("Broker console")).toHaveCount(0);
    expect(await page.title()).not.toContain(HOUSE_NAME);
  });

  test("an unknown subdomain 404s instead of serving the house page", async ({
    page,
  }) => {
    /*
      The dangerous failure is not a 404, it is a 200: a typo'd or spoofed
      host silently falling back to the house tenant would serve Prime's own
      marketing (and, on other routes, Prime's data) to whoever asked.
    */
    const res = await page.goto(
      `http://zz-no-such-tenant.${new URL(apexUrl()).host}/partner-home`,
    );

    expect(res?.status()).toBe(404);
  });
});
