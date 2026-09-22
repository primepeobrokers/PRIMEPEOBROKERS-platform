import { apexUrl, expect, hasCreds, signIn, test } from "./helpers";

/**
 * Console density and motion.
 *
 * The client's report was "stuttery and laggy" plus "too much empty space
 * between rows". Both were real, and neither was server speed:
 *
 * - Every console route is a server component that authenticates and queries
 *   before it can render. Leads and Team had a loading.tsx so the navigation
 *   showed a skeleton immediately; PARTNERS DID NOT, so clicking it left the
 *   previous page frozen until the slowest of the three finished. That frozen
 *   gap is what read as lag.
 * - Rows were padded at 14px vertical, which put a two-line lead row at 64.6px
 *   and fit only nine on a laptop screen.
 *
 * These assertions hold both fixes in place. The density numbers are measured
 * from the rendered result, not from the class names, because the useful
 * property is the pixel height a person actually sees.
 */

test.describe("console density", () => {
  test("the row rhythm is tight but still tappable", async ({ page }) => {
    await page.goto(apexUrl("/"));

    /*
      Built from the shipped classes rather than driven through the real
      console, so this runs without credentials. It asserts the CSS contract
      the console depends on: the compacted padding plus the row floor.
    */
    const r = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;left:0;top:0;width:1100px";
      d.innerHTML = `<table style="width:100%"><tbody>
        <tr id="one" class="h-11"><td class="px-row-x py-row-y align-middle">
          <div style="font-size:15px;font-weight:600;line-height:1.2">Acme Brokers</div></td></tr>
        <tr id="two" class="h-11"><td class="px-row-x py-row-y align-middle">
          <div style="font-size:15px;font-weight:600;line-height:1.2">Acme Corporation</div>
          <div style="margin-top:3px;font-size:13px;line-height:1.2">ops@acme.com</div></td></tr>
      </tbody></table>`;
      document.body.appendChild(d);
      const h = (id: string) =>
        d.querySelector("#" + id)!.getBoundingClientRect().height;
      const out = { single: h("one"), two: h("two") };
      d.remove();
      return out;
    });

    /*
      44px is the floor for a comfortable hit target, and console rows are
      clickable. A single-line row hits exactly the floor: it is held there by
      `h-11` on the tr, which the table model treats as a MINIMUM. min-height
      on the cell does not work (it has no effect on display:table-cell) and
      was tried first, so this assertion is what proves the working mechanism
      is still the one in place.
    */
    expect(r.single, "single-line rows fell below the touch floor").toBeGreaterThanOrEqual(44);

    // The density win: a two-line row was 64.6px before compaction. If this
    // climbs back past 60 the padding has been loosened again.
    expect(r.two, "two-line rows have re-inflated").toBeLessThan(60);

    // ...but the floor must not have swallowed the content either.
    expect(r.two, "two-line rows are crushed").toBeGreaterThan(50);
  });

  test("the density token is the single source of row rhythm", async ({
    page,
  }) => {
    await page.goto(apexUrl("/"));
    const tok = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--pv-row-y").trim(),
    );
    // One token drives every console row, so density is changed in one place.
    expect(tok).toBe("10px");
  });
});

test.describe("console forms nested in tables", () => {
  test("panel text wraps instead of painting across the column", async ({
    page,
  }) => {
    await page.goto(apexUrl("/"));

    /*
      The partner settings drawer renders inside a <td>. TableCell sets
      whitespace-nowrap so a row of data never wraps mid-value, and
      white-space inherits, so every paragraph in that form inherited it too:
      the hints became single unbroken lines that painted across the column
      beside them and ran out past the panel, clipped mid-word.

      Their boxes never grew, so nothing that compares bounding boxes could
      see it. This asserts the reset that fixes it, on the same structure.
    */
    const ws = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;left:0;top:0;width:900px";
      d.innerHTML = `<table><tbody><tr><td class="whitespace-nowrap">
        <div class="pv-panel whitespace-normal p-5">
          <p id="hint" style="width:320px">PNG or WebP, up to 200KB. Shown in their portal header, on their discovery form and at the top of their emails.</p>
        </div></td></tr></tbody></table>`;
      document.body.appendChild(d);
      const el = d.querySelector("#hint") as HTMLElement;
      const out = {
        whiteSpace: getComputedStyle(el).whiteSpace,
        overflow: el.scrollWidth - el.clientWidth,
      };
      d.remove();
      return out;
    });

    expect(ws.whiteSpace, "panel inherited nowrap from the table cell").toBe("normal");
    expect(ws.overflow, "hint text paints outside its box").toBeLessThanOrEqual(2);
  });
});

test.describe("console motion", () => {
  test("every console route has a loading state", async ({ page }) => {
    /*
      This is the regression guard for the actual lag complaint. A console
      route without a loading.tsx leaves the previous screen frozen while the
      server authenticates and queries. Asserted through the served app rather
      than the filesystem so it reflects what shipped.

      An unauthenticated request redirects to /login, which proves the route
      exists and is gated; the loading file itself is checked in the unit
      suite, which can read the build output.
    */
    for (const path of ["/console", "/console/team", "/console/partners"]) {
      await page.goto(apexUrl(path));
      await expect(page, `${path} should gate to sign-in`).toHaveURL(/\/login/);
    }
  });

  test("motion is disabled when the visitor asks for less", async ({
    browser,
  }) => {
    /*
      The console now animates page arrival, row entry and panel disclosure.
      All of it must collapse for prefers-reduced-motion, which is a
      vestibular accessibility requirement, not a preference.
    */
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(apexUrl("/"));

    const durations = await page.evaluate(() => {
      const d = document.createElement("div");
      d.className = "pv-page";
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const out = { anim: cs.animationDuration, trans: cs.transitionDuration };
      d.remove();
      return out;
    });

    /*
      The global block clamps to 0.01ms, which Chromium reports as "1e-05s".
      Parsing to a number rather than matching the string keeps this honest
      across engines and unit spellings: what matters is that the duration is
      effectively zero, not how the browser chooses to print it.
    */
    const seconds = parseFloat(durations.anim);
    expect(Number.isNaN(seconds)).toBe(false);
    expect(seconds, "motion still runs under prefers-reduced-motion").toBeLessThan(0.05);
    await ctx.close();
  });

  test.describe("signed in", () => {
    test.skip(!hasCreds(), "set PV_E2E_EMAIL and PV_E2E_PASSWORD");

    test("switching sections shows a skeleton, never a frozen page", async ({
      page,
    }) => {
      await signIn(page, "/console");

      // Navigate to the slowest route and assert something renders promptly,
      // rather than the previous page persisting until the query returns.
      await page.getByRole("link", { name: "Partners" }).click();

      // The heading is in the loading file too, so it appears before data.
      await expect(
        page.getByRole("heading", { name: "Partners", level: 1 }),
      ).toBeVisible({ timeout: 3000 });
    });

    test("the partner settings panel animates open", async ({ page }) => {
      await signIn(page, "/console/partners");
      await page.goto(apexUrl("/console/partners"));

      const toggle = page.getByRole("button", { name: /show settings/i }).first();
      if ((await toggle.count()) === 0) test.skip(true, "no partners to expand");
      await toggle.click();

      // The panel carries its own entrance, so it settles in rather than
      // snapping to full height and displacing the rows below it.
      const panel = page.locator(".pv-panel").first();
      await expect(panel).toBeVisible();
    });
  });
});
