import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  formatWhen,
  isoDaysAgo,
  stateTone,
  type SubmissionRow,
} from "@/lib/console";
import { CopyDiscoveryLink } from "./copy-link";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false },
};

const PAGE_SIZE = 25;

const COMPLETE_TABS = [
  ["all", "All"],
  ["complete", "Complete"],
  ["partial", "Partial"],
] as const;

const RANGE_TABS = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["all", "All time"],
] as const;

function buildQueryString(params: {
  q: string;
  complete: string;
  range: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.complete !== "all") sp.set("complete", params.complete);
  if (params.range !== "30d") sp.set("range", params.range);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
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
  const page = Math.max(1, Number(searchParams.page) || 1);

  const supabase = await createClient();

  // Is there anything at all? (distinguishes "empty" from "no results")
  const { count: totalCount, error: totalError } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true });

  let query = supabase
    .from("submissions")
    .select(
      "id, ref, status, steps_completed, company_name, contact_name, contact_email, fte_count, benefits_spend, current_setup, created_at, submitted_at",
      { count: "exact" },
    );

  if (complete !== "all") query = query.eq("status", complete);
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

  const { count: partialCount } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "partial");

  const newest = rows[0]?.created_at ? formatWhen(rows[0].created_at) : null;
  const filterSummaryParts = [
    q ? `Search “${q}”` : null,
    complete !== "all" ? `${complete === "partial" ? "Partial" : "Complete"} only` : null,
    range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All time",
  ].filter(Boolean);

  const qs = (over: Partial<{ q: string; complete: string; range: string; page: number }>) =>
    buildQueryString({ q, complete, range, ...over });

  return (
    <main className="mx-auto max-w-[1400px] px-7 pb-20 pt-[34px] max-sm:px-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-7">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-.022em]">
            Leads
          </h1>
          <div className="mt-2 font-mono text-[12.5px] text-ink-muted">
            {totalCount ?? 0} records · {partialCount ?? 0} partial
            {newest ? ` · newest ${newest.slice(11)} UTC` : ""}
          </div>
        </div>
        <div className="flex gap-2.5">
          <a
            href="/console/export"
            className="cursor-pointer rounded-[4px] border border-line-strong bg-transparent px-4 py-[11px] text-sm font-semibold transition-colors duration-150 hover:border-ink"
          >
            Export CSV
          </a>
          <CopyDiscoveryLink className="rounded-[4px] border border-accent bg-accent px-4 py-[11px] text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-press" />
        </div>
      </div>

      {/* filters */}
      <div className="mt-[26px] flex flex-wrap items-center gap-2.5 border-b border-line pb-4">
        <form method="get" action="/console" className="min-w-[220px] max-w-[380px] flex-1">
          {complete !== "all" && (
            <input type="hidden" name="complete" value={complete} />
          )}
          {range !== "30d" && <input type="hidden" name="range" value={range} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search company, contact, or ref"
            aria-label="Search leads"
            className="w-full rounded-[4px] border border-line-strong bg-raised px-3.5 py-[11px] text-[14.5px] transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_rgba(31,61,140,.12)] focus:outline-none"
          />
        </form>
        <div className="flex gap-[3px] rounded-[4px] border border-line bg-tint p-[3px]">
          {COMPLETE_TABS.map(([v, label]) => (
            <Link
              key={v}
              href={`/console${qs({ complete: v, page: 1 })}`}
              aria-pressed={complete === v}
              className="rounded-[2px] px-3 py-2 text-[13.5px] transition-colors duration-150"
              style={{
                background: complete === v ? "#FFF" : "transparent",
                color: complete === v ? "#1A1917" : "#6E6A64",
                fontWeight: complete === v ? 600 : 500,
              }}
            >
              {label}
            </Link>
          ))}
        </div>
        {RANGE_TABS.map(([v, label]) => (
          <Link
            key={v}
            href={`/console${qs({ range: v, page: 1 })}`}
            className="rounded-[4px] px-[13px] py-[9px] font-mono text-[11.5px] uppercase tracking-[.06em] transition-colors duration-150 hover:border-ink"
            style={{
              background: range === v ? "rgba(31,61,140,.06)" : "#FFF",
              border: `1px solid ${range === v ? "#1F3D8C" : "#DFDAD3"}`,
              color: range === v ? "#1F3D8C" : "#4A4741",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-[22px] overflow-hidden rounded-[4px] border border-line bg-raised">
        {(rows.length > 0 || isNoResults) && !hasError && rows.length > 0 && (
          <div className="grid grid-cols-[64px_1.5fr_92px_1fr_1fr_132px_108px] gap-[18px] border-b border-line bg-sunken px-5 py-3 font-mono text-[10.5px] uppercase tracking-[.11em] text-ink-muted max-md:hidden">
            <div>Ref</div>
            <div>Company</div>
            <div className="text-right">Heads</div>
            <div className="text-right">Benefits spend</div>
            <div>Current setup</div>
            <div>Submitted</div>
            <div>State</div>
          </div>
        )}

        {!hasError &&
          rows.map((r) => {
            const tone = stateTone(r);
            return (
              <Link
                key={r.id}
                href={`/console/leads/${r.id}`}
                className="grid grid-cols-[64px_1.5fr_92px_1fr_1fr_132px_108px] items-center gap-[18px] border-b border-sunken px-5 py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-[#FBFAF8] max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-2.5 max-md:px-[18px] max-md:py-4"
              >
                <Cell label="Ref">
                  <span className="font-mono text-[13px] text-ink-muted">{r.ref}</span>
                </Cell>
                <div className="max-md:col-span-2">
                  <div className="text-[15px] font-semibold">
                    {r.company_name || "Unnamed company"}
                  </div>
                  <div className="mt-[3px] text-[13px] text-ink-muted">
                    {r.contact_name || r.contact_email || "No contact yet"}
                  </div>
                </div>
                <Cell label="Heads" right>
                  <span className="font-mono text-sm">{r.fte_count ?? "—"}</span>
                </Cell>
                <Cell label="Benefits spend" right>
                  <span className="font-mono text-sm">
                    {formatMoney(r.benefits_spend)}
                  </span>
                </Cell>
                <Cell label="Current setup">
                  <span className="text-sm text-ink-soft">
                    {r.current_setup ?? "—"}
                  </span>
                </Cell>
                <Cell label="Submitted">
                  <span className="font-mono text-[13px] text-ink-muted">
                    {formatWhen(r.submitted_at ?? r.created_at)}
                  </span>
                </Cell>
                <Cell label="State">
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[2px] px-[7px] py-1 font-mono text-[10.5px] uppercase tracking-[.07em]"
                    style={{
                      color: tone.fg,
                      background: tone.bg,
                      border: `1px solid ${tone.bd}`,
                    }}
                  >
                    <span
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: tone.fg }}
                    />
                    {tone.label}
                  </span>
                </Cell>
              </Link>
            );
          })}

        {isEmpty && (
          <div className="px-8 pb-[78px] pt-[72px] text-center">
            <div className="pv-label">No records yet</div>
            <h2 className="mt-3.5 font-display text-2xl font-semibold tracking-[-.015em]">
              Nothing has come through the flow.
            </h2>
            <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-normal text-ink-soft">
              Submissions land here the moment a visitor finishes step 6. Send
              the discovery link to someone to get started.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <CopyDiscoveryLink className="cursor-pointer rounded-[4px] border border-accent bg-accent px-5 py-3 text-[14.5px] font-semibold text-white" />
            </div>
          </div>
        )}

        {isNoResults && (
          <div className="px-8 pb-[70px] pt-16 text-center">
            <h2 className="font-display text-[22px] font-semibold tracking-[-.015em]">
              No leads match those filters.
            </h2>
            <p className="mt-3 font-mono text-[13px] text-ink-muted">
              {filterSummaryParts.join(" · ")}
            </p>
            <Link
              href="/console"
              className="mt-[22px] inline-block rounded-[4px] border border-line-strong px-[18px] py-[11px] text-[14.5px] font-semibold transition-colors duration-150 hover:border-ink"
            >
              Clear all filters
            </Link>
          </div>
        )}

        {hasError && (
          <div className="px-8 pb-[66px] pt-[60px] text-center">
            <div className="font-mono text-[11px] uppercase tracking-[.13em] text-danger">
              Request failed
            </div>
            <h2 className="mt-3.5 font-display text-[23px] font-semibold tracking-[-.015em]">
              The leads service did not respond.
            </h2>
            <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-normal text-ink-soft">
              Nothing was lost — submissions are still being accepted and will
              appear once this clears.
            </p>
            <Link
              href={`/console${qs({})}`}
              className="mt-6 inline-block rounded-[4px] bg-accent px-5 py-3 text-[14.5px] font-semibold text-white"
            >
              Retry
            </Link>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-5 font-mono text-xs text-ink-muted">
          <div>
            Showing {from + 1}–{from + rows.length} of {filteredCount}
          </div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/console${qs({ page: page - 1 })}`}
                className="rounded-[4px] border border-line-strong px-3 py-[7px] font-mono text-[11.5px] transition-colors duration-150 hover:border-ink"
              >
                PREV
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-[4px] border border-line px-3 py-[7px] font-mono text-[11.5px] text-ink-disabled">
                PREV
              </span>
            )}
            {from + rows.length < filteredCount ? (
              <Link
                href={`/console${qs({ page: page + 1 })}`}
                className="rounded-[4px] border border-line-strong px-3 py-[7px] font-mono text-[11.5px] transition-colors duration-150 hover:border-ink"
              >
                NEXT
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-[4px] border border-line px-3 py-[7px] font-mono text-[11.5px] text-ink-disabled">
                NEXT
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** Table cell that grows a mono label above itself on mobile. */
function Cell({
  label,
  right,
  children,
}: {
  label: string;
  right?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${right ? "text-right max-md:text-left" : ""} max-md:flex max-md:flex-col max-md:gap-[3px]`}
    >
      <span className="hidden font-mono text-[10px] uppercase tracking-[.11em] text-ink-faint max-md:block">
        {label}
      </span>
      {children}
    </div>
  );
}
