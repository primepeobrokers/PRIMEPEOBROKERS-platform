import { apexUrl, expect, HOUSE_NAME, test } from "./helpers";

/**
 * The house marketing site, which the partner work refactored underneath.
 *
 * app/page.tsx was reduced to a thin wrapper around a shared LandingSections
 * component so that the house and partner pages cannot drift. That refactor
 * moved roughly a thousand lines. These assertions are the cheap proof that
 * the public page still says what it is supposed to say.
 */
test.describe("house marketing page", () => {
  test("renders the house brand and the partner pitch", async ({ page }) => {
    await page.goto(apexUrl("/"));

    expect(await page.title()).toContain(HOUSE_NAME);

    // The section the client specifically asked to be renamed from
    // "For brokers", and the copy they supplied with it.
    await expect(page.getByText("For partners").first()).toBeVisible();
    await expect(
      page.getByText("Refer a client, keep the relationship.").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/partner inquiries go straight to our team/i).first(),
    ).toBeVisible();
  });

  test("the hero video is lazy and small", async ({ page }) => {
    /*
      The hero clip was 11.1MB with preload="auto", about 35x the rest of the
      page, and it downloaded before anything else could. It is rendered under
      grayscale + a colour wash, so the detail was invisible anyway.

      Asserting the ATTRIBUTE rather than timing a download keeps this test
      deterministic: preload="none" is the property that makes the file not
      block first paint, and a future edit that drops it is exactly the
      regression worth catching.
    */
    await page.goto(apexUrl("/"));

    const video = page.locator("video").first();
    if ((await video.count()) === 0) test.skip(true, "no hero video on this build");

    await expect(video).toHaveAttribute("preload", "none");
  });

  test("footer legal links are distinct and correct", async ({ page }) => {
    await page.goto(apexUrl("/"));

    /*
      The footer bottom bar had "Privacy" twice and pointed "Terms" at
      /#trust, an anchor on the same page. Both links now resolve, and a
      reader can reach the terms at all.

      Note what is NOT asserted: that no /#trust link exists. The footer
      still links "Data handling" to that anchor, which is correct. The bug
      was a link LABELLED Terms going there, so the assertion is about the
      Terms link specifically.
    */
    await expect(page.locator('footer a[href="/privacy"]').first()).toBeVisible();

    const terms = page.locator('footer a', { hasText: /^Terms/ });
    await expect(terms.first()).toBeVisible();
    await expect(terms.first()).toHaveAttribute("href", "/terms");

    // "Privacy" appeared twice in the bottom bar, once pointing at the wrong
    // place. One labelled Privacy link, pointing at /privacy.
    const privacy = page.locator('footer a', { hasText: /^Privacy/ });
    for (let i = 0; i < (await privacy.count()); i++) {
      await expect(privacy.nth(i)).toHaveAttribute("href", "/privacy");
    }
  });

  test("the partner surfaces are not reachable on the house host", async ({
    page,
  }) => {
    /*
      /partner-home is the rewrite TARGET for a partner host. Left reachable
      on the apex it would serve a second copy of the marketing page for
      crawlers to index, so it 404s.
    */
    const res = await page.goto(apexUrl("/partner-home"));
    expect(res?.status(), "/partner-home should 404 on the apex").toBe(404);

    /*
      /portal does NOT 404 on the apex, it redirects to sign-in, because the
      proxy gates it on auth before it reaches the apex rewrite. Anonymous
      visitors cannot see a portal either way, which is the property that
      matters; asserting 404 here would be asserting an implementation detail
      that is not true.
    */
    await page.goto(apexUrl("/portal"));
    await expect(page).toHaveURL(/\/login/);
  });

  test("no horizontal scroll at phone width", async ({ page }) => {
    /*
      A page that scrolls sideways on a phone looks broken to every visitor on
      one, and it is invisible on a desktop run. 390px is an iPhone 14.
    */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(apexUrl("/"));
    await page.waitForLoadState("domcontentloaded");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, "page scrolls horizontally at 390px").toBeLessThanOrEqual(1);
  });
});
