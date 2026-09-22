import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * Route-level loading state for the partners list.
 *
 * WHY THIS FILE EXISTS: without it, clicking "Partners" left the PREVIOUS
 * page frozen on screen while the server ran requireStaff(), listed every
 * tenant, and issued one lead count per partner. Nothing moved except the 2px
 * top-loader, so the app read as stuck: the "stuttery, laggy" complaint was
 * mostly this, not slow code. Leads and Team already had a loading file;
 * Partners was the one that did not, and it is the slowest of the three
 * because of the per-partner counts.
 *
 * The skeleton mirrors the real page's structure (heading, description,
 * action, count line, table with its five columns) so the layout does not
 * shift when data replaces it. A skeleton that does not match its page trades
 * a frozen screen for a jumping one.
 */
export default function PartnersLoading() {
  return (
    <main className="pv-page mx-auto max-w-[1100px] px-7 pb-12 pt-6 max-sm:px-[18px] max-sm:py-5">
      <header className="mb-5 flex items-start justify-between gap-6 max-sm:flex-col max-sm:gap-4">
        <div>
          {/* Real heading, not a bar: the title is known before the data is,
              and showing it immediately makes the navigation feel resolved. */}
          <h1 className="font-display text-[26px] font-semibold tracking-[-.02em] text-ink">
            Partners
          </h1>
          <div className="mt-1.5 flex max-w-[68ch] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full max-w-[520px]" />
            <Skeleton className="h-3.5 w-full max-w-[420px]" />
          </div>
        </div>
        <Skeleton className="h-9 w-[132px] shrink-0" />
      </header>

      <section>
        <div className="mb-3 h-[15px]">
          <Skeleton className="h-3 w-24" />
        </div>

        <div className="overflow-hidden rounded-md border border-line">
          {/* Header strip, matching TableHead's sunken ground and height. */}
          <div className="flex items-center gap-4 border-b border-line bg-sunken px-row-x py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-12" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
          </div>

          {/*
            data-rows gives these the same staggered entrance the real rows
            get, so the skeleton and the table it becomes move alike instead
            of the placeholder sitting still and the content popping in.
          */}
          <div data-rows>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-sunken px-row-x py-row-y last:border-b-0"
              >
                <Skeleton className="h-3.5 w-[120px]" />
                <Skeleton className="h-3.5 w-[190px] max-md:hidden" />
                <Skeleton className="ml-auto h-3.5 w-6" />
                <Skeleton className="h-3.5 w-6" />
                <Skeleton className="h-5 w-[58px] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
