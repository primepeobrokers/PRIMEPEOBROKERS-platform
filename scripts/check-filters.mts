/**
 * The leads list encodes its filter state in the URL and parses it back on
 * every render, so the two halves have to be exact inverses. They used to be
 * two hand-maintained copies in different files (page.tsx and
 * lead-filters.tsx) that had to agree about which values count as defaults.
 *
 * Three properties are checked here, each standing in for a real failure:
 *
 *   1. Round-trip identity. A filter that does not survive the URL silently
 *      resets itself when the person navigates.
 *   2. Defaults never appear in the query string. Otherwise every shared link
 *      carries the full state and stops being readable.
 *   3. leadFiltersKey changes whenever any single field changes. That key is
 *      the list's Suspense boundary key: if it misses a field, switching that
 *      filter leaves stale rows on screen with no loading state.
 */
import {
  LEAD_FILTER_DEFAULTS,
  isFiltered,
  leadFiltersKey,
  leadFiltersToQuery,
  parseLeadFilters,
  type LeadFilters,
} from "../lib/console/query";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

const STAGES = ["new", "in-progress", "contacted", "closed"] as const;
const MEMBERS = ["11111111-1111-4111-8111-111111111111"] as const;
const valid = { stageSlugs: STAGES, memberIds: MEMBERS };

/** Parse a query string the way the page does. */
function parseQS(qs: string) {
  const raw: Record<string, string> = {};
  new URLSearchParams(qs.replace(/^\?/, "")).forEach((v, k) => { raw[k] = v; });
  return parseLeadFilters(raw, valid);
}

// ---------------------------------------------------------------------------
// 1. Round-trip identity across a matrix of real states.
// ---------------------------------------------------------------------------
const matrix: LeadFilters[] = [
  LEAD_FILTER_DEFAULTS,
  { ...LEAD_FILTER_DEFAULTS, q: "acme" },
  { ...LEAD_FILTER_DEFAULTS, complete: "partial" },
  { ...LEAD_FILTER_DEFAULTS, complete: "complete", range: "7d" },
  { ...LEAD_FILTER_DEFAULTS, range: "all" },
  { ...LEAD_FILTER_DEFAULTS, category: "peo" },
  { ...LEAD_FILTER_DEFAULTS, stage: "contacted" },
  { ...LEAD_FILTER_DEFAULTS, stage: "closed", assignee: "unassigned" },
  { ...LEAD_FILTER_DEFAULTS, assignee: "me" },
  { ...LEAD_FILTER_DEFAULTS, assignee: MEMBERS[0] },
  { ...LEAD_FILTER_DEFAULTS, page: 4 },
  { q: "big co", complete: "complete", range: "7d", category: "payroll",
    stage: "in-progress", assignee: "me", page: 3 },
];

for (const f of matrix) {
  const back = parseQS(leadFiltersToQuery(f));
  ok(JSON.stringify(back) === JSON.stringify(f),
     `round trip lost state: ${JSON.stringify(f)} became ${JSON.stringify(back)}`);
}
console.log(`ok ${matrix.length} filter states round-trip through the URL`);

// ---------------------------------------------------------------------------
// 2. Defaults stay out of the URL, and a default-only state is not "filtered".
// ---------------------------------------------------------------------------
ok(leadFiltersToQuery(LEAD_FILTER_DEFAULTS) === "",
   "the default state must produce an empty query string");
ok(!isFiltered(LEAD_FILTER_DEFAULTS), "the default state must not read as filtered");
for (const key of ["complete", "range", "category", "stage", "assignee"] as const) {
  const qs = leadFiltersToQuery({ ...LEAD_FILTER_DEFAULTS });
  ok(!qs.includes(key), `default value for "${key}" leaked into the query string`);
}
ok(isFiltered({ ...LEAD_FILTER_DEFAULTS, stage: "closed" }),
   "a stage filter must read as filtered");
ok(isFiltered({ ...LEAD_FILTER_DEFAULTS, assignee: "me" }),
   "an assignee filter must read as filtered");
console.log("ok defaults stay out of the query string");

// ---------------------------------------------------------------------------
// 3. Unknown runtime values collapse to "all" rather than filtering to zero.
// ---------------------------------------------------------------------------
ok(parseQS("?stage=deleted-stage").stage === "all",
   "an unknown stage slug must collapse to all, not filter to an empty list");
ok(parseQS("?assignee=99999999-9999-4999-8999-999999999999").assignee === "all",
   "an unknown assignee id must collapse to all");
ok(parseQS("?category=not-a-category").category === "all",
   "an unknown category must collapse to all");
ok(parseQS("?complete=nonsense").complete === "all", "bad complete must default");
ok(parseQS("?range=nonsense").range === "30d", "bad range must default to 30d");
ok(parseQS("?page=0").page === 1, "page must floor at 1");
ok(parseQS("?page=-5").page === 1, "a negative page must floor at 1");
ok(parseQS("?page=abc").page === 1, "a non-numeric page must floor at 1");
ok(parseQS("?q=%20%20spaced%20%20").q === "spaced", "q must be trimmed");
// A retired stage is still a valid slug, so an existing link keeps working.
ok(parseLeadFilters({ stage: "closed" }, valid).stage === "closed",
   "a known stage must survive parsing");
console.log("ok unknown stage and assignee values collapse to all");

// ---------------------------------------------------------------------------
// 4. The Suspense key covers every field.
// ---------------------------------------------------------------------------
const base = LEAD_FILTER_DEFAULTS;
const variants: Partial<LeadFilters>[] = [
  { q: "x" },
  { complete: "partial" },
  { range: "7d" },
  { category: "peo" },
  { stage: "contacted" },
  { assignee: "me" },
  { page: 2 },
];
for (const v of variants) {
  const field = Object.keys(v)[0];
  ok(leadFiltersKey({ ...base, ...v }) !== leadFiltersKey(base),
     `leadFiltersKey ignores "${field}": the Suspense boundary will not remount`);
}
ok(leadFiltersKey(base) === leadFiltersKey({ ...base }),
   "leadFiltersKey must be stable for equal states");
console.log(`ok the Suspense key reflects all ${variants.length} filter fields`);

if (fails) { console.log(`\n${fails} check(s) failed`); process.exit(1); }
console.log("check-filters: pass");
