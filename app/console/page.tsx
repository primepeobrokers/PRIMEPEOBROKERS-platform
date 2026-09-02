import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterXIcon, InboxIcon, PlugZapIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  SUBMISSION_LIST_SELECT,
  isoDaysAgo,
  type SubmissionRow,
} from "@/lib/console";
import { CATEGORIES, categoryName } from "@/lib/discovery/schema";
import { CopyDiscoveryLink } from "./copy-link";
import { ExportCsvButton } from "./export-button";
import { LeadFilters } from "./lead-filters";
import { LeadCard } from "./lead-card";
import { LeadRow } from "./lead-row";
import { LeadsTableSkeleton } from "./leads-skeleton";
import { Button } from "@/app/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false },
};

const PAGE_SIZE = 25;

interface Filters {
  q: string;
  complete: string;
  range: string;
  category: string;
  page: number;
}

function buildQueryString(f: Partial<Filters>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.complete && f.complete !== "all") sp.set("complete", f.complete);
  if (f.range && f.range !== "30d") sp.set("range", f.range);
  if (f.category && f.category !== "all") sp.set("category", f.category);
  if (f.page && f.page > 1) sp.set("page", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function LeadsPage(props: PageProps<"/console">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const complete =
    searchParams.complete === "complete" || searchParams.complete === "partial"
      ? searchParams.complete
      : "all";
  const range =
    searchParams.range === "7d" || searchParams.range === "all"
      ? searchParams.range
      : "30d";
  const category =
    typeof searchParams.category === "string" &&
    CATEGORIES.some((c) => c.id === searchParams.category)
      ? searchParams.category
      : "all";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const filters: Filters = { q, complete, range, category, page };

  return (
    <main className="mx-auto max-w-[1400px] px-gutter pb-20 pt-8 max-sm:px-gutter-sm">
      <div className="flex flex-wrap items-end justify-between gap-7">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-.022em]">
            Leads
          </h1>
          <Suspense
            fallback={
              <div className="mt-2 h-[19px] font-mono text-[12.5px] text-ink-muted">
                Loading records…
              </div>
            }
          >
            <LeadsSummary />
          </Suspense>
        </div>
        <div className="flex gap-2.5">
          <ExportCsvButton />
          <CopyDiscoveryLink className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-press" />
        </div>
      </div>

      <div className="mt-[26px] border-b border-line pb-4">
        <LeadFilters initial={{ q, complete, range, category }} />
      </div>

      <div className="mt-[22px]">
        {/*
          The key restarts the boundary whenever a filter changes, so switching
          tabs shows the skeleton again instead of leaving stale rows on screen
          while the new query runs.
        */}
        <Suspense
          key={`${q}|${complete}|${range}|${category}|${page}`}
          fallback={<LeadsTableSkeleton />}
        >
          <LeadsTable filters={filters} />
        </Suspense>
      </div>
    </main>
  );
}

/** Record counts under the title. Split out so it streams independently. */
async function LeadsSummary() {
  const supabase = await createClient();
  const [{ count: totalCount }, { count: partialCount }] = await Promise.all([
    supabase.from("submissions").select("id", { count: "exact", head: true }),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "partial"),
  ]);

  return (
    <div className="mt-2 font-mono text-[12.5px] text-ink-muted">
      {totalCount ?? 0} {totalCount === 1 ? "record" : "records"} ·{" "}
      {partialCount ?? 0} partial
    </div>
  );
}

async function LeadsTable({ filters }: { filters: Filters }) {
  const { q, complete, range, category, page } = filters;
  const supabase = await createClient();

  const { count: totalCount, error: totalError } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true });

  let query = supabase
    .from("submissions")
    .select(SUBMISSION_LIST_SELECT, { count: "exact" });

  if (complete !== "all") query = query.eq("status", complete);
  if (category !== "all") query = query.eq("category", category);
  if (range !== "all") {
    query = query.gte("created_at", isoDaysAgo(range === "7d" ? 7 : 30));
  }
  if (q) {
    const esc = q.replaceAll("%", "\\%").replaceAll(",", " ");
    const ors = [
      `company_name.ilike.%${esc}%`,
      `contact_name.ilike.%${esc}%`,
      `contact_email.ilike.%${esc}%`,
    ];
    if (/^\d+$/.test(q)) ors.push(`ref.eq.${q}`);
    query = query.or(ors.join(","));
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as SubmissionRow[];
  const filteredCount = count ?? 0;
  const hasError = !!error || !!totalError;
  const isEmpty = !hasError && (totalCount ?? 0) === 0;
  const isNoResults = !hasError && !isEmpty && rows.length === 0;

  const filterSummary = [
    q ? `Search “${q}”` : null,
    complete !== "all"
      ? `${complete === "partial" ? "Partial" : "Complete"} only`
      : null,
    category !== "all" ? `${categoryName(category)} only` : null,
    range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All time",
  ]
    .filter(Boolean)
    .join(" · ");

  if (hasError) {
    return (
      <div className="rounded-md border border-line bg-raised">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="frame-danger">
              <PlugZapIcon />
            </EmptyMedia>
            <EmptyTitle className="font-display text-[23px] font-semibold tracking-[-.015em]">
              The leads service did not respond.
            </EmptyTitle>
            <EmptyDescription>
              Nothing was lost. Submissions are still being accepted and will
              appear once this clears.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={`/console${buildQueryString(filters)}`}>Retry</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-md border border-line bg-raised">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="frame">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle className="font-display text-2xl font-semibold tracking-[-.015em]">
              Nothing has come through the flow.
            </EmptyTitle>
            <EmptyDescription>
              Submissions land here the moment a visitor finishes step 6. Send
              the discovery link to someone to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CopyDiscoveryLink className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-press" />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (isNoResults) {
    return (
      <div className="rounded-md border border-line bg-raised">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="frame">
              <FilterXIcon />
            </EmptyMedia>
            <EmptyTitle className="font-display text-[22px] font-semibold tracking-[-.015em]">
              No leads match those filters.
            </EmptyTitle>
            <EmptyDescription className="font-mono text-[13px]">
              {filterSummary}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href="/console">Clear all filters</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-line bg-raised">
        {/* Cards below the table breakpoint: a fixed-layout table cannot
            reflow into anything readable at phone widths. */}
        <div className="hidden max-md:block">
          {rows.map((r) => (
            <LeadCard key={r.id} row={r} />
          ))}
        </div>
        <div className="max-md:hidden">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[76px]">Ref</TableHead>
              <TableHead className="w-[38%]">Company</TableHead>
              <TableHead className="w-[84px] text-right">Heads</TableHead>
              <TableHead className="w-[126px] text-right">
                Benefits spend
              </TableHead>
              <TableHead className="w-[186px]">Category</TableHead>
              <TableHead className="w-[136px]">Submitted</TableHead>
              <TableHead className="w-[128px]">State</TableHead>
              <TableHead className="w-[52px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <LeadRow key={r.id} row={r} />
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-5 font-mono text-xs text-ink-muted">
        <div>
          Showing {from + 1}–{from + rows.length} of {filteredCount}
        </div>
        <div className="flex gap-2">
          <Button
            asChild={page > 1}
            variant="outline"
            size="sm"
            disabled={page <= 1}
            className="font-mono text-[11.5px]"
          >
            {page > 1 ? (
              <Link href={`/console${buildQueryString({ ...filters, page: page - 1 })}`}>
                PREV
              </Link>
            ) : (
              <span>PREV</span>
            )}
          </Button>
          <Button
            asChild={from + rows.length < filteredCount}
            variant="outline"
            size="sm"
            disabled={from + rows.length >= filteredCount}
            className="font-mono text-[11.5px]"
          >
            {from + rows.length < filteredCount ? (
              <Link href={`/console${buildQueryString({ ...filters, page: page + 1 })}`}>
                NEXT
              </Link>
            ) : (
              <span>NEXT</span>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
