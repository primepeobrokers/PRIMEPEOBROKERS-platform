import { apexUrl, expect, hasCreds, signIn, test } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * Overlapping and overflowing text, caught mechanically.
 *
 * This file exists because of a specific recurring bug in this codebase. A
 * bare inline label (`<span>` or `<label>` with no `block`) does not stack, so
 * the control beneath it starts at the label's right edge and the label's box
 * runs sideways across whatever is next to it. It was fixed in `Field`, then
 * in `ColorField`, and `LogoField` still had it: three instances of one
 * mistake, each found by a human squinting at a screenshot.
 *
 * A screenshot is not a test. These assertions find the class of bug rather
 * than the instance.
 */

/**
 * Elements whose content is wider than their own box.
 *
 * scrollWidth > clientWidth means the text does not fit and is spilling out.
 * The tolerance absorbs sub-pixel rounding, which fires constantly at
 * fractional zoom and would otherwise make this test a liar.
 */
async function overflowing(page: Page, root: string) {
  return page.evaluate((sel) => {
    const host = document.querySelector(sel);
    if (!host) return [];
    return [...host.querySelectorAll<HTMLElement>("p, span, label, h1, h2, h3, div")]
      .filter((el) => {
        if (el.offsetParent === null) return false;
        const s = getComputedStyle(el);
        // Elements that scroll on purpose are not overflowing, they are doing
        // their job. The activity feed is one.
        if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
        if (s.overflowX === "hidden") return false;
        /*
          scrollWidth > clientWidth catches text painting wider than its own
          box, which is the failure this check exists for and the one a
          bounding-box comparison cannot see.

          The case that taught us: the partner branding panel sits inside a
          <td>, TableCell sets whitespace-nowrap, and white-space INHERITS.
          Every hint in that form became one unbroken line that painted
          straight across the next column and out past the panel, while its
          BOX stayed the declared 320px. Box-intersection reported nothing.
          This comparison reported 316px.
        */
        return el.scrollWidth - el.clientWidth > 2;
      })
      .slice(0, 10)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
  }, root);
}

/**
 * Pairs of text elements whose boxes intersect.
 *
 * This is the direct test for "some text is overlapping". Only leaf text
 * nodes are compared, because an ancestor always contains its descendant and
 * comparing those would report every nesting level as a collision.
 */
async function overlappingText(page: Page, root: string) {
  return page.evaluate((sel) => {
    const host = document.querySelector(sel);
    if (!host) return [];

    const leaves = [...host.querySelectorAll<HTMLElement>("p, span, label")].filter(
      (el) =>
        el.offsetParent !== null &&
        el.textContent?.trim() &&
        !el.querySelector("p, span, label"),
    );

    const hits: string[] = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!.getBoundingClientRect();
        const b = leaves[j]!.getBoundingClientRect();
        if (!a.width || !a.height || !b.width || !b.height) continue;
        // 2px of slack: adjacent baselines legitimately touch.
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2) {
          hits.push(
            `"${leaves[i]!.textContent!.trim().slice(0, 40)}" overlaps ` +
              `"${leaves[j]!.textContent!.trim().slice(0, 40)}"`,
          );
        }
        if (hits.length >= 8) return hits;
      }
    }
    return hits;
  }, root);
}

test.describe("layout: nothing overlaps or spills", () => {
  test("public pages at three widths", async ({ page }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/privacy", "/terms"]) {
        await page.goto(apexUrl(path));
        await page.waitForLoadState("domcontentloaded");

        const spills = await overflowing(page, "body");
        expect(spills, `${path} at ${width}px: content wider than its box`).toEqual([]);
      }
    }
  });

  test.describe("console partner branding form", () => {
    test.skip(!hasCreds(), "set PV_E2E_EMAIL and PV_E2E_PASSWORD");

    test("the branding tab does not overlap or spill", async ({ page }) => {
      await signIn(page, "/console/partners");
      await page.goto(apexUrl("/console/partners"));

      /*
        The exact screen the bug was reported on: expand a partner, open
        Branding, and the logo help text ("PNG or WebP, up to 200KB...") ran
        out past the panel while "Body text" collided with the partner-email
        hint beside it.

        Root cause was two halves of one thing. The `Logo` label was a bare
        inline <span>, so the row under it did not stack; and neither the
        logo row nor its grid column could shrink (a grid item defaults to
        min-width:auto), so the row set the column's width and pushed its own
        help text past the edge.
      */
      /*
        "Show settings", which is what the button actually says. An earlier
        version of this test looked for /expand|collapse/i, matched nothing,
        and silently skipped itself through the entire episode this file
        exists to guard: the overlap was reported twice by the client while
        this assertion never ran once. A skip is not a pass, and a selector
        guessed from the behaviour rather than read from the markup is how a
        test quietly stops testing.
      */
      const firstRow = page
        .getByRole("button", { name: /show settings/i })
        .first();
      await expect(
        firstRow,
        "no partner rows to expand: the fixture project has no partners",
      ).toBeVisible();
      await firstRow.click();

      const branding = page.getByRole("tab", { name: /branding/i }).first();
      await expect(branding, "the branding tab did not render").toBeVisible();
      await branding.click();
      await page.waitForTimeout(400);

      /*
        The visible panel only. Radix keeps the inactive tab panels mounted
        but hidden, and a hidden panel has zero-size boxes that would report
        as neither overflowing nor overlapping, diluting the check.
      */
      const panel = '[data-slot="tabs-content"]:not([hidden])';
      expect(await overflowing(page, panel), "branding fields spill out").toEqual([]);
      expect(await overlappingText(page, panel), "branding text overlaps").toEqual([]);
    });
  });
});
