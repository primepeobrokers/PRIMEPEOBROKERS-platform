import { CATEGORIES } from "@/lib/discovery/schema";

/**
 * The leads list filter state, and the only place the URL shape is defined.
 *
 * This replaces a buildQueryString() in app/console/page.tsx and a near
 * identical toQuery() in app/console/lead-filters.tsx, which had to agree
 * about which values count as defaults and therefore stay out of the URL. Two
 * copies of that rule is one too many, and Phase 2 adds two more fields to
 * both.
 */
export interface LeadFilters {
  q: string;
  complete: "all" | "complete" | "partial";
  range: "7d" | "30d" | "all";
  /** Category id from lib/discovery/schema.ts, or "all". */
  category: string;
  /** lead_stages slug, or "all". Validated against runtime data. */
  stage: string;
  /** A profile id, or "me", "unassigned", "all". */
  assignee: string;
  page: number;
}

export const LEAD_FILTER_DEFAULTS: LeadFilters = {
  q: "",
  complete: "all",
  range: "30d",
  category: "all",
  stage: "all",
  assignee: "all",
  page: 1,
};

/** Assignee values that are not profile ids. */
export const ASSIGNEE_ME = "me";
export const ASSIGNEE_UNASSIGNED = "unassigned";

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/**
 * Parse raw searchParams into validated filters.
 *
 * Stage slugs and member ids are runtime data now, so unlike the category
 * check they cannot be validated against a static list: the caller passes what
 * currently exists. Anything unrecognised collapses to "all" rather than being
 * passed through to the query, because a filter for a stage that no longer
 * exists returns zero rows behind an empty state that reads as data loss.
 */
export function parseLeadFilters(
  raw: Record<string, string | string[] | undefined>,
  valid: { stageSlugs?: readonly string[]; memberIds?: readonly string[] } = {},
): LeadFilters {
  const complete = one(raw.complete);
  const range = one(raw.range);
  const category = one(raw.category);
  const stage = one(raw.stage);
  const assignee = one(raw.assignee);

  const stageOk = (valid.stageSlugs ?? []).includes(stage);
  const assigneeOk =
    assignee === ASSIGNEE_ME ||
    assignee === ASSIGNEE_UNASSIGNED ||
    (valid.memberIds ?? []).includes(assignee);

  return {
    q: one(raw.q).trim(),
    complete:
      complete === "complete" || complete === "partial" ? complete : "all",
    range: range === "7d" || range === "all" ? range : "30d",
    category: CATEGORIES.some((c) => c.id === category) ? category : "all",
    stage: stageOk ? stage : "all",
    assignee: assigneeOk ? assignee : "all",
    page: Math.max(1, Number(one(raw.page)) || 1),
  };
}

/**
 * The inverse. Only non-default values reach the URL, so a shared link carries
 * what the person actually chose and nothing else.
 */
export function leadFiltersToQuery(f: Partial<LeadFilters>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.complete && f.complete !== "all") sp.set("complete", f.complete);
  if (f.range && f.range !== "30d") sp.set("range", f.range);
  if (f.category && f.category !== "all") sp.set("category", f.category);
  if (f.stage && f.stage !== "all") sp.set("stage", f.stage);
  if (f.assignee && f.assignee !== "all") sp.set("assignee", f.assignee);
  if (f.page && f.page > 1) sp.set("page", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Stable key for the list's Suspense boundary.
 *
 * Derived from the whole object rather than hand-built from named fields: the
 * previous version was a five-field template string, so adding a filter
 * without remembering to extend it meant the boundary never remounted and
 * stale rows sat on screen while the new query ran.
 */
export function leadFiltersKey(f: LeadFilters): string {
  return [
    f.q,
    f.complete,
    f.range,
    f.category,
    f.stage,
    f.assignee,
    f.page,
  ].join("|");
}

/** True when anything is narrowing the list, for the "Clear" affordance. */
export function isFiltered(f: LeadFilters): boolean {
  return (
    !!f.q ||
    f.complete !== "all" ||
    f.range !== "30d" ||
    f.category !== "all" ||
    f.stage !== "all" ||
    f.assignee !== "all"
  );
}
