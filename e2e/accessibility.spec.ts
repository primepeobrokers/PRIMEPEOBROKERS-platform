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

/**
 * Colour contrast, measured from the rendered page.
 *
 * Added after an audit found five failures the eye had missed, the worst at
 * 2.85:1. Every one was the same mistake: a token tuned for light grounds
 * (`ink-muted`, `ink-faint`) used on the navy footer, or a faint token
 * carrying real content on white. Tokens make that easy to get wrong, because
 * the name says how loud the text should be and nothing says which ground it
 * belongs to.
 *
 * This walks the real DOM rather than checking class names, so it catches the
 * mistake whatever route it arrives by.
 */
test.describe("colour contrast", () => {
  for (const path of ["/", "/privacy", "/terms"]) {
    test(`${path} meets WCAG AA for text`, async ({ page }) => {
      await page.goto(apexUrl(path));
      await page.waitForTimeout(400);

      const failures = await page.evaluate(() => {
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        /*
          Parse a computed colour to RGB, and REFUSE anything that is not
          plain rgb()/rgba().

          This is the correction that matters most in this file. The first
          version pulled the first three numbers out of whatever string it
          was handed, which quietly mangled modern colour syntax: an
          `oklab(0.64 0.21 0.13 / 0.04)` background became the RGB triple
          (0, 0, 0), so a pale pink card read as near-black and its perfectly
          legible dark text was reported at 2.22:1. Tightening the text
          colour then made the reported ratio WORSE, which is the tell that
          the measurement was wrong rather than the design.

          Returning null for unparseable colours makes the walk continue to
          an ancestor it can actually read, which is the honest answer.
        */
        const parse = (s: string) => {
          const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
        };
        /*
          Walk up for the first opaque background. A translucent layer over
          white is not the effective ground, and treating it as one produces
          false failures: an early version of this reported navy-on-orange-wash
          as 1.34:1 when the real pairing was fine.
        */
        const bgOf = (el: Element): number[] => {
          let n: Element | null = el;
          while (n) {
            const c = getComputedStyle(n).backgroundColor;
            const p = parse(c);
            /*
              Skip a layer when it is fully transparent, when it is only
              partly opaque (compositing it properly needs the stack below,
              and a wash over white is lighter than the wash alone), or when
              parse could not read it at all. Walking on is safe: the page
              bottoms out at an opaque ancestor or at white.
            */
            const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(c);
            /*
              >= 0.9, not > 0.92. The sticky header is rgba(255,255,255,.92)
              and a strict > excluded exactly it, so the walk sailed past a
              near-opaque white and compared the nav links against the navy
              hero behind it. Anything at 90% or more is close enough to its
              own colour that compositing would not change the verdict.
            */
            const opaque = !alpha || Number(alpha[1]) >= 0.9;
            /*
              Skip an element that only paints in its grid gaps. A grid with
              `gap-px` uses its own background as hairline rules while every
              cell paints over it, so that colour is never behind the text:
              treating it as the ground reported white-backed cells against
              a grey border and produced three false failures.
            */
            const cs2 = getComputedStyle(n);
            const isGapRule =
              cs2.display.includes("grid") && parseFloat(cs2.columnGap || "0") <= 2;
            if (p && opaque && !isGapRule) return p;
            n = n.parentElement;
          }
          return [255, 255, 255];
        };

        const out: string[] = [];
        for (const el of document.querySelectorAll("p,span,div,a,li,td,th,label,h1,h2,h3,h4")) {
          const e = el as HTMLElement;
          if (!e.offsetParent) continue;
          // Own text only: an ancestor's colour does not describe its children.
          const txt = [...e.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent!.trim())
            .join("");
          if (!txt) continue;

          const cs = getComputedStyle(e);
          const fg = parse(cs.color);
          if (!fg) continue;
          // Translucent text would need compositing to judge fairly.
          if (/rgba?\([^)]*,\s*0?\.\d+\)/.test(cs.color)) continue;

          const L1 = lum(fg);
          const L2 = lum(bgOf(e));
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

          const px = parseFloat(cs.fontSize);
          const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
          /*
            The house orange is 3.9:1 on white and the brand guide accepts it
            for buttons with bold white labels (AGENTS.md states this
            explicitly). That is a documented decision, not a defect.

            Detecting it by background alone was not enough: bgOf walks up to
            the first opaque ancestor, and a button whose own background is
            the accent can sit inside a translucent header, so the walk
            sailed past it and compared white text against white. That
            reported the hero CTA at 1.00:1, a number no real pairing can
            produce, which is the tell that the measurement rather than the
            colour was wrong. Check the element's OWN background too.
          */
          const ownBg = parse(cs.backgroundColor);
          const isAccentGround = (c: number[] | null) =>
            !!c && c[0]! > 230 && c[1]! < 80 && c[2]! < 60;
          if (isAccentGround(ownBg) || isAccentGround(bgOf(e))) continue;

          const floor = large ? 3 : 4.5;
          if (ratio < floor) {
            out.push(`${ratio.toFixed(2)}:1 (needs ${floor}) ${Math.round(px)}px "${txt.slice(0, 30)}"`);
          }
        }
        return [...new Set(out)];
      });

      expect(failures, `${path} has text below WCAG AA`).toEqual([]);
    });
  }
});
