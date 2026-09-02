import { TOTAL_STEPS } from "@/lib/discovery/schema";

/*
  SubmissionRow moved to lib/console/columns.ts, where it sits next to the
  select-list constant it has to agree with. Re-exported here so the existing
  import sites keep working: the row shape and the formatters below are
  genuinely different concerns, but churning four files to prove it is not
  worth a separate diff.
*/
export {
  type SubmissionRow,
  type Member,
  SUBMISSION_LIST_SELECT,
  SUBMISSION_DETAIL_SELECT,
  MEMBER_SELECT,
  memberName,
} from "@/lib/console/columns";

import type { SubmissionRow } from "@/lib/console/columns";

/**
 * Badge colourway per submission state. Returns a Badge variant name rather
 * than colour strings: the colours live in globals.css as --pv-tone-* tokens,
 * so a state reads as one word here and stays themeable in one place.
 */
export function stateTone(row: Pick<SubmissionRow, "status" | "steps_completed">): {
  label: string;
  variant: "positive" | "warning";
} {
  if (row.status === "complete") {
    return { label: "Complete", variant: "positive" };
  }
  return {
    label: `Partial ${row.steps_completed}/${TOTAL_STEPS}`,
    variant: "warning",
  };
}

/** "2026-08-24 14:32" in UTC. Mono, sortable at a glance. */
export function formatWhen(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "–";
  return "$" + Number(n).toLocaleString("en-US");
}

/** ISO timestamp for `days` ago, for filter boundaries in list queries. */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

/** Whole days from now until a YYYY-MM-DD date (negative when past). */
export function daysUntil(date: string): number {
  return Math.round(
    (new Date(date + "T00:00:00Z").getTime() - Date.now()) / 86400000,
  );
}
