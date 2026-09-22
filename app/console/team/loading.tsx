import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * Route-level loading state for the team screen, mirroring its real
 * two-column layout so nothing jumps when the roster lands.
 */
export default function TeamLoading() {
  return (
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-12 pt-6 max-sm:px-gutter-sm">
      <div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-.022em]">
          Team
        </h1>
        <div className="mt-2 h-[19px]">
          <Skeleton className="h-3.5 w-44" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_340px] items-start gap-6 [&>*]:min-w-0 max-lg:grid-cols-1">
        <div className="flex flex-col gap-6">
          <section>
            <Skeleton className="h-5 w-[92px]" />
            <div className="mt-3.5 overflow-hidden rounded-md border border-line bg-raised">
              <div data-rows>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 border-b border-sunken px-row-x py-row-y last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-[160px]" />
                      <Skeleton className="mt-2 h-3.5 w-[210px]" />
                    </div>
                    <Skeleton className="h-9 w-[130px] max-sm:hidden" />
                    <Skeleton className="h-8 w-[76px]" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <Skeleton className="h-5 w-[120px]" />
            <Skeleton className="mt-2 h-4 w-[340px] max-w-full" />
            <div className="mt-3.5 overflow-hidden rounded-md border border-line bg-raised">
              <div data-rows>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 border-b border-sunken px-row-x py-row-y last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-[52px] w-7" />
                      <div>
                        <Skeleton className="h-5 w-[110px]" />
                        <Skeleton className="mt-2 h-3 w-[60px]" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-[140px]" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6 max-lg:order-first">
          <div className="rounded-md border border-line bg-raised px-row-x py-5">
            <Skeleton className="h-5 w-[140px]" />
            <Skeleton className="mt-4 h-9 w-full" />
            <Skeleton className="mt-3 h-9 w-full" />
            <Skeleton className="mt-3 h-9 w-full" />
            <Skeleton className="mt-4 h-9 w-[120px]" />
          </div>
          <div>
            <Skeleton className="h-5 w-[110px]" />
            <div className="mt-3.5 rounded-md border border-line bg-raised px-row-x py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-b border-sunken py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="mt-2 h-3 w-[90px]" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
