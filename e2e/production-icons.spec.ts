import { expect, test } from "./helpers";

/**
 * Partner tab icons, checked against PRODUCTION.
 *
 * WHY THIS FILE EXISTS, AND WHY THE LOCAL TESTS WERE NOT ENOUGH.
 *
 * The partner favicon shipped twice looking correct and was broken both
 * times, and the local suite passed through both because the failure only
 * exists in production's network topology.
 *
 * The route inlines a partner's logo by fetching it from Supabase Storage.
 * Against localhost that fetch is effectively instant. From the deployed
 * function (which runs in Singapore while Storage answers elsewhere) it took
 * between 2.2 and 9.1 seconds, against a 2.5 second timeout. So it aborted on
 * nearly every request and silently fell back to a letter tile: the client
 * saw a coloured "A" in the tab on their own branded site, while every local
 * assertion stayed green.
 *
 * A timeout is not visible in markup and not reproducible on a fast link, so
 * the only honest test is one that asks the real deployment.
 *
 * Skipped unless PV_E2E_PROD is set, because it reaches the public internet
 * and depends on live data. Run it after a deploy:
 *
 *   PV_E2E_PROD=1 pnpm test:e2e e2e/production-icons.spec.ts
 */

const PROD = process.env.PV_E2E_PROD ? "https://primevantagehcm.com" : "";

/**
 * Partners known to have uploaded artwork. If one of these serves a letter
 * tile, the inline path is failing, whatever the reason.
 */
const WITH_LOGOS = ["acme", "abs-partner"];

test.describe("production partner icons", () => {
  test.skip(!PROD, "set PV_E2E_PROD=1 to check the live deployment");

  for (const slug of WITH_LOGOS) {
    test(`${slug} serves its own logo, not a fallback tile`, async ({
      request,
    }) => {
      const res = await request.get(
        `https://${slug}.primevantagehcm.com/partner-icon`,
        { timeout: 30_000 },
      );

      expect(res.status()).toBe(200);
      const body = await res.text();

      /*
        The distinguishing marks. The logo branch emits an <image> carrying a
        data URI; the tile branch emits a <rect> and a <text>. Checking for
        the data URI specifically also catches a regression to the linked
        version, which renders as a broken image.
      */
      expect(
        body,
        `${slug} fell back to a letter tile: the logo fetch is failing in production`,
      ).toContain("<image");
      expect(
        body,
        `${slug} is linking its logo rather than inlining it, so it will not paint`,
      ).toContain("data:image/");
      expect(body).not.toContain("<text");
    });
  }

  test("the icon is small enough to be worth serving", async ({ request }) => {
    const res = await request.get(
      "https://acme.primevantagehcm.com/partner-icon",
      { timeout: 30_000 },
    );
    const body = await res.text();

    /*
      Base64 inflates by a third, so a 200KB upload lands near 270KB here.
      Well past that and someone has uploaded artwork that has no business in
      a 16px slot, and every page load on that partner's site pays for it.
    */
    expect(
      body.length,
      "the inlined icon is larger than the cap allows",
    ).toBeLessThan(420_000);
  });
});
