import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterXIcon, InboxIcon, PlugZapIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  SUBMISSION_LIST_SELECT,
  isoDaysAgo,
  type Member,
  type SubmissionRow,
} from "@/lib/console";
import {
  leadFiltersKey,
  leadFiltersToQuery,
  parseLeadFilters,
  ASSIGNEE_ME,
  ASSIGNEE_UNASSIGNED,
  type LeadFilters as Filters,
} from "@/lib/console/query";
import { stageLabel, stageSlugs, type Stage } from "@/lib/console/stages";
import { fetchMembers, fetchStages } from "@/lib/console/stages.server";
import { requireUser } from "@/lib/auth/session";
import { categoryName } from "@/lib/discovery/schema";
import { CopyDiscoveryLink } from "./copy-link";
import { ExportCsvButton } from "./export-button";
import { LeadFilters } from "./lead-filters";
import { LeadCard } from "./lead-card";
import { LeadRow } from "./lead-row";
import { LeadsTableSkeleton } from "./leads-skeleton";
import { LeadsPagination } from "./leads-pagination";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false },
};

const PAGE_SIZE = 25;

export default async function LeadsPage(props: PageProps<"/console">) {
  const searchParams = await props.searchParams;

  /*
    Stages and the roster are read before the filters are parsed, because
    parsing validates ?stage= and ?assignee= against what actually exists. An
    unknown or deleted value has to collapse to "all" rather than filtering
    the list to nothing behind an empty state that reads as data loss.

    All three are independent, so they overlap instead of queueing.
  */
  const [ctx, stages, members] = await Promise.all([
    requireUser("/console"),
    fetchStages(),
    fetchMembers(),
  ]);
  const filters = parseLeadFilters(searchParams, {
    stageSlugs: stageSlugs(stages),
    memberIds: members.map((m) => m.id),
  });

  return (
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-20 pt-8 max-sm:px-gutter-sm">
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
        <LeadFilters initial={filters} stages={stages} members={members} />
      </div>

      <div className="mt-[22px]">
        {/*
          The key restarts the boundary whenever a filter changes, so switching
          tabs shows the skeleton again instead of leaving stale rows on screen
          while the new query runs.
        */}
        <Suspense key={leadFiltersKey(filters)} fallback={<LeadsTableSkeleton />}>
          <LeadsTable
            filters={filters}
            stages={stages}
            members={members}
            viewerId={ctx.userId}
          />
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

async function LeadsTable({
  filters,
  stages,
  members,
  viewerId,
}: {
  filters: Filters;
  stages: Stage[];
  members: Member[];
  viewerId: string;
}) {
  const { q, complete, range, category, stage, assignee, page } = filters;
  const supabase = await createClient();

  const { count: totalCount, error: totalError } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true });

  let query = supabase
    .from("submissions")
    .select(SUBMISSION_LIST_SELECT, { count: "exact" });

  if (complete !== "all") query = query.eq("status", complete);
  if (category !== "all") query = query.eq("category", category);
  if (stage !== "all") query = query.eq("lead_stage", stage);
  /*
    Assignee. ASSIGNEE_ME resolves to the caller here rather than in the URL,
    so a shared "my leads" link means "the reader's leads" and a bookmarked
    one keeps working after a handover.

    parseLeadFilters only admits a profile id it was given in memberIds, so by
    the time a raw id reaches this point it is known to be a teammate in the
    caller's tenant. RLS would scope the result either way; this keeps an
    unknown id from silently returning an empty list.
  */
  if (assignee === ASSIGNEE_UNASSIGNED) {
    query = query.is("assigned_to", null);
  } else if (assignee === ASSIGNEE_ME) {
    query = query.eq("assigned_to", viewerId);
  } else if (assignee !== "all") {
    query = query.eq("assigned_to", assignee);
  }
  if (range !== "all") {
    query = query.gte("created_at", isoDaysAgo(range === "7d" ? 7 : 30));
  }
  if (q) {
    /*
      Escape both LIKE wildcards, not just %. An underscore matches any single
      character, so searching "A_B Holdings" was quietly also matching
      "AxB Holdings": a search that appears to work but returns the wrong
      rows is worse than one that returns none.

      Commas are replaced rather than escaped because they separate the terms
      of the .or() expression below, and PostgREST offers no escape for them.
    */
    const esc = q
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_")
      .replaceAll(",", " ");
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
  // One Map for the whole page: resolving an owner per row would otherwise be
  // a linear scan of the roster for each of the 25 rows.
  const byId = new Map(members.map((m) => [m.id, m]));
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
    stage !== "all" ? `${stageLabel(stage, stages)} stage` : null,
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
              <Link href={`/console${leadFiltersToQuery(filters)}`}>Retry</Link>
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
        <div className="hidden max-md:block" data-rows>
          {rows.map((r) => (
            <LeadCard
              key={r.id}
              row={r}
              stages={stages}
              owner={r.assigned_to ? byId.get(r.assigned_to) : undefined}
            />
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
              <TableHead className="w-[128px]">Status</TableHead>
              <TableHead className="w-[52px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-rows>
            {rows.map((r) => (
              <LeadRow
                key={r.id}
                row={r}
                stages={stages}
                owner={r.assigned_to ? byId.get(r.assigned_to) : undefined}
              />
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <LeadsPagination
        filters={filters}
        page={page}
        totalPages={Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))}
        from={from}
        shown={rows.length}
        total={filteredCount}
      />
    </>
  );
}
