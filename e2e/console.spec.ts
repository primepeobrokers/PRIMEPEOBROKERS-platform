import { apexUrl, expect, hasCreds, signIn, test, topAfterScroll } from "./helpers";

/**
 * Signed-in console coverage: the UI work the client reacted to.
 *
 * Everything here needs a real session, so the whole file skips without
 * credentials rather than failing. These tests read and open things; none of
 * them submits a form that writes, because the project they run against is
 * shared.
 */
test.describe("console", () => {
  test.skip(!hasCreds(), "set PV_E2E_EMAIL and PV_E2E_PASSWORD");

  test("signs in and reaches the console", async ({ page }) => {
    await signIn(page, "/console");
    await expect(page).toHaveURL(/\/console/);
  });

  test.describe("partners page", () => {
    test("the create form is a modal, not always on screen", async ({ page }) => {
      await signIn(page, "/console/partners");
      await page.goto(apexUrl("/console/partners"));

      /*
        The client's complaint was that the create form occupied the top of
        the page permanently, pushing the list (the daily job) below the fold
        for a task done a handful of times a year.
      */
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.getByRole("button", { name: /add a partner/i }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel(/company name/i)).toBeVisible();
    });

    test("the modal closes on Escape and resets on reopen", async ({ page }) => {
      await signIn(page, "/console/partners");
      await page.goto(apexUrl("/console/partners"));

      await page.getByRole("button", { name: /add a partner/i }).click();
      const name = page.getByRole("dialog").getByLabel(/company name/i);
      await name.fill("ZZ Discard Me");

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      /*
        Reopening must not resurrect the abandoned draft. A form that
        remembers what you deliberately threw away is how a half-typed
        partner gets created by accident.
      */
      await page.getByRole("button", { name: /add a partner/i }).click();
      await expect(page.getByRole("dialog").getByLabel(/company name/i)).toHaveValue("");
    });

    test("the modal returns focus to its trigger when dismissed", async ({
      page,
    }) => {
      await signIn(page, "/console/partners");
      await page.goto(apexUrl("/console/partners"));

      // Keyboard users land back where they were, instead of at the top of
      // the document with no idea where focus went.
      await page.getByRole("button", { name: /add a partner/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");

      await expect(page.getByRole("button", { name: /add a partner/i })).toBeFocused();
    });
  });

  test.describe("team page", () => {
    test("the activity feed scrolls inside its own box", async ({ page }) => {
      await signIn(page, "/console/team");
      await page.goto(apexUrl("/console/team"));

      /*
        The feed is a log: it only grows, and rendered at full height it
        decided how tall the whole page was. Capping it is what keeps the page
        a fixed size no matter how busy the team is.

        Asserting the box is SHORTER than its contents proves the cap is doing
        something. Asserting only max-height would pass on an empty feed.
      */
      /*
        The capped one specifically. The Team page has three [data-rows]
        containers (members, stages, activity) because the attribute drives
        the staggered row entrance everywhere; only the activity feed is
        height-capped, so the max-h class is what identifies it.
      */
      const feed = page.locator("[data-rows].max-h-\\[420px\\]");
      await expect(feed).toBeVisible();

      const { clientHeight, scrollHeight } = await feed.evaluate((el) => ({
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      }));

      expect(clientHeight).toBeLessThanOrEqual(430);
      if (scrollHeight <= clientHeight) {
        test.skip(true, "feed is shorter than its cap; nothing to scroll");
      }
      expect(scrollHeight).toBeGreaterThan(clientHeight);
    });

    test("the sidebar sticks while the page scrolls", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page, "/console/team");
      await page.goto(apexUrl("/console/team"));

      const scrollable = await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight + 400,
      );
      if (!scrollable) test.skip(true, "page too short to scroll meaningfully");

      /*
        position:sticky cannot be tested from computed style: the property
        reads "sticky" whether or not it has an offset that makes it hold. A
        sticky box keeps its viewport position while a static one moves up by
        the scroll distance, so compare the box before and after.
      */
      const { before, after } = await topAfterScroll(page, "aside", 400);

      expect(
        Math.abs(after - before),
        "sidebar scrolled away instead of sticking",
      ).toBeLessThan(120);
    });
  });
});
