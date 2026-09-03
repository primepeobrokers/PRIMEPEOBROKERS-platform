import { ArrowLeftIcon } from "lucide-react";
import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * Route-level loading state for a lead's detail page.
 *
 * Opening a lead is the most common navigation in the console, so it is the
 * one place a blocked render hurts most. The real back link renders
 * immediately (it needs no data and gives an instant way out), and the
 * skeleton holds the same two-column grid as the page so the layout is
 * already settled when the record arrives.
 */
export default function LeadLoading() {
  return (
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-[90px] pt-7 max-sm:px-gutter-sm">
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[.1em] text-ink-muted">
        <ArrowLeftIcon className="size-3.5" />
        All leads
      </span>

      <div className="mt-[18px] flex flex-wrap items-end justify-between gap-7">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-[72px]" />
            <Skeleton className="h-[22px] w-[92px]" />
          </div>
          <Skeleton className="mt-3 h-8 w-[300px] max-w-[70vw]" />
          <Skeleton className="mt-3 h-4 w-[380px] max-w-[80vw]" />
        </div>
        <Skeleton className="h-10 w-[150px]" />
      </div>

      <div className="mt-[26px] grid grid-cols-[1fr_320px] items-start gap-7 [&>*]:min-w-0 max-lg:grid-cols-1">
        <div className="flex flex-col gap-5 max-lg:order-2" data-rows>
          {[0, 1, 2].map((i) => (
            <section
              key={i}
              className="overflow-hidden rounded-md border border-line bg-raised"
            >
              <div className="border-b border-line bg-sunken px-row-x py-[13px]">
                <Skeleton className="h-4 w-[180px]" />
              </div>
              <div className="grid grid-cols-2 gap-px max-sm:grid-cols-1">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="bg-raised px-row-x py-3.5">
                    <Skeleton className="h-3 w-[90px]" />
                    <Skeleton className="mt-2 h-4 w-[150px]" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-5" data-rows>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-md border border-line bg-raised px-row-x py-4"
            >
              <Skeleton className="h-4 w-[110px]" />
              <Skeleton className="mt-4 h-9 w-full" />
              <Skeleton className="mt-3 h-9 w-full" />
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
