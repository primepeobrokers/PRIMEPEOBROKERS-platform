"use client";

import { useEffect } from "react";

/**
 * Scroll reveal for the landing page.
 *
 * Three behaviours, chosen per element rather than applied uniformly:
 *
 *   [data-reveal]    a section arrives as one block
 *   [data-stagger]   children arrive in sequence, because they are a real list
 *   [data-sequence]  the focal moment (the comparison table) resolving
 *
 * Anything already on screen at mount never animates: a reveal that runs on
 * content the reader is already looking at reads as a glitch. Reduced-motion
 * users get everything immediately, and a fallback timer guarantees nothing
 * stays hidden if IntersectionObserver never fires.
 */

/** Per-item delay and the ceiling for a whole group, in milliseconds. */
const STEP = { stagger: 55, sequence: 70 } as const;
const MAX_TOTAL = 420;

export function RevealInit() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-reveal],[data-stagger],[data-sequence]",
      ),
    );

    // Only animate what is still below the fold. Anything already on screen is
    // left untouched: a reveal that runs on content the reader is looking at
    // reads as a glitch.
    const pending = nodes.filter(
      (n) => n.getBoundingClientRect().top >= window.innerHeight * 0.9,
    );

    for (const n of pending) {
      if (n.hasAttribute("data-reveal")) n.classList.add("pv-reveal");

      const kind = n.hasAttribute("data-sequence")
        ? "sequence"
        : n.hasAttribute("data-stagger")
          ? "stagger"
          : null;

      if (kind) {
        const children = Array.from(n.children) as HTMLElement[];
        // Compress the step when a list is long so the tail never drags.
        const step = Math.min(
          STEP[kind],
          Math.max(1, Math.floor(MAX_TOTAL / Math.max(1, children.length))),
        );
        children.forEach((c, i) =>
          c.style.setProperty("--pv-delay", `${i * step}ms`),
        );
        // Arming is what makes the children start hidden. The stylesheet does
        // nothing on its own, so a group this script never reaches, or a run
        // that throws before this point, still renders its content.
        n.classList.add("pv-armed");
      }
    }

    const show = (n: HTMLElement) => n.classList.add("is-visible");

    if (!("IntersectionObserver" in window)) {
      pending.forEach(show);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    pending.forEach((n) => io.observe(n));

    const fallback = setTimeout(() => pending.forEach(show), 4000);

    /*
      Anchor navigation resolves its destination immediately instead of letting
      it animate in. Smooth scrolling already carries the eye to the section, so
      a reveal firing on arrival competes with that motion, and a reader who
      clicked "FAQ" wants the FAQ, not a second animation. Reveals the reader
      scrolls to naturally are untouched.
    */
    const revealTarget = (hash: string) => {
      if (!hash || hash === "#") return;
      let target: Element | null = null;
      try {
        target = document.querySelector(hash);
      } catch {
        return; // malformed hash from a hand-edited URL
      }
      if (!target) return;
      for (const n of pending) {
        if (n === target || target.contains(n) || n.contains(target)) {
          show(n);
          io.unobserve(n);
        }
      }
    };

    const onNavClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (href?.startsWith("#")) revealTarget(href);
    };

    const onHashChange = () => revealTarget(location.hash);

    document.addEventListener("click", onNavClick);
    window.addEventListener("hashchange", onHashChange);
    // A page opened directly on an anchor.
    if (location.hash) revealTarget(location.hash);

    return () => {
      clearTimeout(fallback);
      io.disconnect();
      document.removeEventListener("click", onNavClick);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return null;
}
