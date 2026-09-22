import { apexUrl, expect, hasPartner, test } from "./helpers";
import { PARTNER_SLUG } from "../playwright.config";
import { partnerHost } from "../playwright.config";

/**
 * The logo, and the browser-tab icon.
 *
 * The cube is an isometric PEO monogram: one letter per visible face, P on
 * top, E on the left, O on the right. It shipped for weeks as a hand trace
 * that had quietly lost two of the three letters, and nothing caught it
 * because no check looked at the rendered mark. These do.
 */
test.describe("brand mark", () => {
  test("the cube is one path with its letter counters intact", async ({
    page,
  }) => {
    await page.goto(apexUrl("/"));

    const svg = page.locator("header svg").first();
    await expect(svg).toBeVisible();

    /*
      evenodd is what punches the letter counters out of the solid faces.
      Without it the P loses its bowl and the O fills in, which is exactly the
      state the client reported. Asserting the fill rule catches a regression
      that a screenshot diff would show but no other check would.
    */
    await expect(svg).toHaveAttribute("fill-rule", "evenodd");

    // One compound path, not the seven-polygon trace it replaced.
    await expect(svg.locator("path")).toHaveCount(1);

    /*
      The counters exist as subpaths. A path with fewer than eight `M`
      commands is missing letters: the geometry is the three faces plus the
      strokes and counters that spell PEO.
    */
    const d = (await svg.locator("path").getAttribute("d")) ?? "";
    const subpaths = (d.match(/M/g) ?? []).length;
    expect(subpaths, "cube path lost subpaths, letters are missing").toBeGreaterThanOrEqual(8);
  });

  test("the house tab icon is the multi-size ico", async ({ page }) => {
    await page.goto(apexUrl("/"));
    const icons = page.locator('link[rel="icon"]');
    await expect(icons).toHaveCount(1);
    await expect(icons.first()).toHaveAttribute("href", /favicon\.ico/);
  });

  test("/partner-icon 404s on the house host", async ({ page }) => {
    // A house request must never be served a partner's mark, and vice versa.
    const res = await page.goto(apexUrl("/partner-icon"));
    expect(res?.status()).toBe(404);
  });

  test.describe("partner tab icon", () => {
    test.skip(!hasPartner(), "set PV_E2E_PARTNER_SLUG");

    test("a partner page offers its own icon, ranked above the house ico", async ({
      page,
    }) => {
      await page.goto(`http://${partnerHost(PARTNER_SLUG)}/partner-home`);

      const partnerIcon = page.locator('link[rel="icon"][href="/partner-icon"]');
      await expect(partnerIcon).toHaveCount(1);

      /*
        Next injects app/favicon.ico into every route's head, first and tagged
        256x256, and a root-only convention cannot be suppressed per route.
        sizes="any" marks the partner's SVG as scalable, which browsers prefer
        over a fixed-size raster. Without it the partner's own domain can show
        Prime's cube.
      */
      await expect(partnerIcon).toHaveAttribute("sizes", "any");
    });

    test("the icon resolves to real artwork", async ({ page }) => {
      const res = await page.goto(
        `http://${partnerHost(PARTNER_SLUG)}/partner-icon`,
      );

      expect(res?.status()).toBe(200);
      const type = res?.headers()["content-type"] ?? "";
      expect(type).toMatch(/image\/(svg\+xml|png|webp)/);
    });
  });
});
