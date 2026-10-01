import { apexUrl, expect, hasPartner, partnerUrl, test } from "./helpers";

/**
 * Every page offers a way on.
 *
 * The client's review found pages a visitor could reach and not leave. The
 * worst was the 404: with no app/not-found.tsx, a mistyped URL or a stale
 * link landed on Next's built-in screen, which is black, unbranded, and
 * carries no link at all. On a site whose only job is to start a discovery
 * flow, a dead end is a lost lead.
 *
 * These assert the affordance, not the wording, so copy edits do not break
 * them: at least one link or button that leaves the page, on every surface a
 * visitor can land on cold.
 */

/** Links and buttons that actually go somewhere, excluding in-page anchors. */
async function escapeRoutes(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("a[href], button")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const href = el.getAttribute("href");
      // A bare "#..." only scrolls; it does not get the visitor out.
      if (href !== null && href.startsWith("#")) continue;
      out.push(`${el.tagName.toLowerCase()}:${href ?? "(button)"}`);
    }
    return out;
  });
}

test.describe("escape routes", () => {
  test("the 404 is branded and offers a way on", async ({ page }) => {
    const res = await page.goto(apexUrl("/no-such-page-exists"));
    expect(res?.status()).toBe(404);

    // Not Next's default screen.
    await expect(page.getByRole("link", { name: /home/i }).first()).toBeVisible();

    const routes = await escapeRoutes(page);
    expect(routes.length, "404 with no way out").toBeGreaterThan(1);

    // The two the page is for: carry on, or go back.
    await expect(page.getByRole("link", { name: /start shopping/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /homepage/i })).toBeVisible();
  });

  test("a partner 404 keeps the visitor on the partner host", async ({ page }) => {
    test.skip(!hasPartner(), "set PV_E2E_PARTNER_SLUG");
    await page.goto(partnerUrl("/no-such-page-exists"));

    /*
      The destinations are relative, so they resolve against whichever host
      the visitor is on. A partner's lead must never be handed to Prime's
      homepage: that is the failure the white-label work exists to prevent.
    */
    for (const name of [/start shopping/i, /homepage/i]) {
      const href = await page.getByRole("link", { name }).getAttribute("href");
      expect(href, "absolute link would cross hosts").not.toMatch(/^https?:/);
    }
  });

  test("public pages a visitor lands on cold all offer a way on", async ({
    page,
  }) => {
    for (const path of ["/privacy", "/terms", "/talk", "/discovery"]) {
      await page.goto(apexUrl(path));
      await page.waitForLoadState("domcontentloaded");
      const routes = await escapeRoutes(page);
      expect(routes.length, `${path} has no way out`).toBeGreaterThan(0);
    }
  });
});
