import { apexUrl, expect, test } from "./helpers";

/**
 * Accessibility checks that only a rendered page can answer.
 *
 * Deliberately a small set of high-signal, zero-false-positive assertions
 * rather than a full axe sweep. A public marketing site for a licensed
 * brokerage has a real compliance interest here, and a noisy scanner that
 * reports forty contrast warnings on decorative text gets muted within a
 * week.
 */
const PUBLIC_PAGES = ["/", "/privacy", "/terms", "/talk"];

test.describe("accessibility", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has exactly one h1 and an ordered heading outline`, async ({
      page,
    }) => {
      await page.goto(apexUrl(path));

      const levels = await page.evaluate(() =>
        [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
          .filter((h) => (h as HTMLElement).offsetParent !== null)
          .map((h) => Number(h.tagName[1])),
      );

      expect(levels.filter((l) => l === 1), `${path} h1 count`).toHaveLength(1);

      // A skipped level (h2 straight to h4) tells a screen-reader user a
      // section is missing.
      for (let i = 1; i < levels.length; i++) {
        expect(
          levels[i]! - levels[i - 1]!,
          `${path} heading jumps from h${levels[i - 1]} to h${levels[i]}`,
        ).toBeLessThanOrEqual(1);
      }
    });

    test(`${path} gives every image alt text`, async ({ page }) => {
      await page.goto(apexUrl(path));

      const missing = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
          .filter((i) => !i.hasAttribute("alt"))
          .map((i) => i.getAttribute("src") ?? "(no src)"),
      );

      // alt="" is correct for decoration; a MISSING alt makes a screen reader
      // read the filename aloud.
      expect(missing, `${path} images without an alt attribute`).toEqual([]);
    });
  }

  test("the page declares a language", async ({ page }) => {
    await page.goto(apexUrl("/"));
    expect(await page.locator("html").getAttribute("lang")).toBeTruthy();
  });

  test("every form control on the sign-in screen has a label", async ({
    page,
  }) => {
    await page.goto(apexUrl("/login"));

    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll("input")]
        .filter((el) => {
          const i = el as HTMLInputElement;
          if (i.type === "hidden") return false;
          if (i.getAttribute("aria-label") || i.getAttribute("aria-labelledby")) return false;
          return !(i.id && document.querySelector(`label[for="${i.id}"]`));
        })
        .map((el) => (el as HTMLInputElement).name || (el as HTMLInputElement).type),
    );

    expect(unlabelled, "inputs with no associated label").toEqual([]);
  });

  test("keyboard focus is visible on the primary call to action", async ({
    page,
  }) => {
    await page.goto(apexUrl("/login"));

    const button = page.getByRole("button", { name: "Sign in" });
    await button.focus();

    /*
      A focus ring removed with `outline: none` and nothing put back is the
      single most common keyboard-accessibility failure. Checking for ANY of
      outline, box-shadow or ring is deliberately permissive: the project
      styles focus with box-shadow, and the test should assert that focus is
      perceivable, not dictate how.
    */
    const visible = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      const outline =
        s.outlineStyle !== "none" && parseFloat(s.outlineWidth || "0") > 0;
      const shadow = s.boxShadow !== "none" && s.boxShadow !== "";
      return outline || shadow;
    });

    expect(visible, "no visible focus indicator on the sign-in button").toBe(true);
  });
});
