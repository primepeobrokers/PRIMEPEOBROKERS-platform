"use client";

import { useState } from "react";

export interface FaqItem {
  q: string;
  a: string;
}

export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="border-t border-line">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="border-b border-line">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-6 px-1 py-5 text-left text-[17px] font-medium transition-colors duration-150 hover:text-accent"
            >
              <span>{f.q}</span>
              {/* accent-press: these glyphs are 16px text, not a large
                  numeral, and raw accent is 3.58:1 on the tinted ground.
                  See AGENTS.md on where the orange is usable. */}
              <span className="flex-none font-mono text-base text-accent-press">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            <div
              className="overflow-hidden transition-all duration-250 ease-(--pv-ease)"
              style={{
                maxHeight: isOpen ? "540px" : "0px",
                opacity: isOpen ? 1 : 0,
              }}
            >
              <p className="max-w-[74ch] pb-[22px] pl-1 pr-[60px] text-[15.5px] leading-relaxed text-ink-soft [text-wrap:pretty] max-sm:pr-4">
                {f.a}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
