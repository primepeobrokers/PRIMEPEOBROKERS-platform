import { Skeleton } from "@/app/components/ui/skeleton";
import { LeadsTableSkeleton } from "./leads-skeleton";

/**
 * Route-level loading state for the leads list.
 *
 * This is what makes navigation feel instant: without a loading file the
 * whole route blocks on the server render and the only signal is the 2px
 * top-loader bar, which reads as a stuck page. The skeleton mirrors the real
 * page's layout (title, actions, filter bar, table) so nothing shifts when
 * the data lands.
 */
export default function ConsoleLoading() {
  return (
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-12 pt-6 max-sm:px-gutter-sm">
      <div className="flex flex-wrap items-end justify-between gap-7">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-.022em]">
            Leads
          </h1>
          <div className="mt-2 h-[19px]">
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="h-9 w-[104px]" />
          <Skeleton className="h-9 w-[150px]" />
        </div>
      </div>

      <div className="mt-5 border-b border-line pb-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-9 w-[220px]" />
          <Skeleton className="h-9 w-[130px]" />
          <Skeleton className="h-9 w-[130px]" />
          <Skeleton className="h-9 w-[130px]" />
          <Skeleton className="h-9 w-[130px]" />
        </div>
      </div>

      <div className="mt-4">
        <LeadsTableSkeleton />
      </div>
    </main>
  );
}
