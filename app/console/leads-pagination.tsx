import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { leadFiltersToQuery, type LeadFilters } from "@/lib/console/query";

/**
 * Numbered pagination for the leads list.
 *
 * Server-rendered links, not buttons with handlers: the page number already
 * lives in the URL (so it survives refresh and can be shared), and a link
 * keeps it that way for free. Every href round-trips the full filter set, so
 * paging never silently drops a search.
 *
 * The window shows the first page, the last page, and the current page with
 * one neighbour either side; gaps collapse to an ellipsis. That keeps the
 * strip the same width at page 2 and page 200.
 */
export function LeadsPagination({
  filters,
  page,
  totalPages,
  from,
  shown,
  total,
}: {
  filters: LeadFilters;
  page: number;
  totalPages: number;
  from: number;
  shown: number;
  total: number;
}) {
  const href = (p: number) =>
    `/console${leadFiltersToQuery({ ...filters, page: p })}`;

  const items = pageWindow(page, totalPages);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-5">
      <div className="font-mono text-xs text-ink-muted">
        {total === 0
          ? "0 records"
          : `Showing ${from + 1}–${from + shown} of ${total}`}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <PageLink
            href={page > 1 ? href(page - 1) : undefined}
            label="Previous page"
          >
            <ChevronLeftIcon className="size-4" />
          </PageLink>

          {items.map((item, i) =>
            item === "gap" ? (
              <span
                key={`gap-${i}`}
                aria-hidden
                className="w-7 text-center font-mono text-xs text-ink-faint"
              >
                &hellip;
              </span>
            ) : (
              <PageLink
                key={item}
                href={item === page ? undefined : href(item)}
                label={`Page ${item}`}
                current={item === page}
              >
                {item}
              </PageLink>
            ),
          )}

          <PageLink
            href={page < totalPages ? href(page + 1) : undefined}
            label="Next page"
          >
            <ChevronRightIcon className="size-4" />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

/**
 * One cell of the strip. A missing href renders the same box disabled, so the
 * strip never changes width or alignment at either end of the range.
 */
function PageLink({
  href,
  label,
  current,
  children,
}: {
  href?: string;
  label: string;
  current?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-xs transition-colors duration-150";

  if (current) {
    return (
      <span aria-current="page" aria-label={label} className={cn(base, "bg-dark font-semibold text-dark-ink")}>
        {children}
      </span>
    );
  }
  if (!href) {
    return (
      <span aria-hidden className={cn(base, "text-ink-disabled")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(base, "text-ink-soft hover:bg-sunken hover:text-ink")}
    >
      {children}
    </Link>
  );
}

/** First, last, current with one neighbour either side; gaps become "gap". Exported for scripts/check-filters.mts. */
export function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of pages) {
    // A gap of exactly one page is the page itself: show it instead of an
    // ellipsis that would stand in for a single number.
    if (p - prev === 2) out.push(prev + 1);
    else if (p - prev > 2) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}
