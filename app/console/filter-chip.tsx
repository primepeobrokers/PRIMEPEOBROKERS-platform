import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One filter option in the console toolbar. Selected state is carried by the
 * accent border and tint; unselected chips stay on the neutral line so a row
 * of them reads as one control rather than a row of competing buttons.
 *
 * Replaces three near-identical blocks that each computed background, border
 * and colour inline per render.
 */
export function FilterChip({
  href,
  selected,
  mono,
  children,
}: {
  href: string;
  selected: boolean;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex items-center rounded-sm border px-3 py-2 text-[13px] transition-colors duration-150",
        mono && "font-mono text-[11.5px] uppercase tracking-[0.06em]",
        selected
          ? "border-accent bg-[var(--pv-tone-accent-bg)] font-semibold text-accent"
          : "border-line bg-raised text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
