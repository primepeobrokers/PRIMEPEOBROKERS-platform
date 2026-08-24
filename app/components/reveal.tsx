"use client";

import { useEffect } from "react";

/**
 * Progressive scroll reveal for sections marked with [data-reveal].
 * Matches the design: sections already in the viewport never animate,
 * reduced-motion users see everything immediately, and a fallback timer
 * guarantees nothing stays hidden.
 */
export function RevealInit() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const pending = nodes.filter(
      (n) => n.getBoundingClientRect().top >= window.innerHeight * 0.9,
    );
    pending.forEach((n) => n.classList.add("pv-reveal"));

    const show = (n: HTMLElement) => n.classList.add("is-visible");
    if (!("IntersectionObserver" in window)) {
      pending.forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            show(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    pending.forEach((n) => io.observe(n));
    const fallback = setTimeout(() => pending.forEach(show), 4000);
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, []);
  return null;
}
