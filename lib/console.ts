import { TOTAL_STEPS } from "@/lib/discovery/schema";

export interface SubmissionRow {
  id: string;
  ref: number;
  status: "partial" | "complete";
  steps_completed: number;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  fte_count: number | null;
  benefits_spend: number | null;
  current_setup: string | null;
  category: string | null;
  intent: string | null;
  created_at: string;
  submitted_at: string | null;
}

/** Badge colourway per submission state, from the design system. */
export function stateTone(row: Pick<SubmissionRow, "status" | "steps_completed">) {
  if (row.status === "complete") {
    return {
      label: "Complete",
      fg: "var(--pv-positive-deep)",
      bg: "color-mix(in oklab,var(--pv-positive) 9%,transparent)",
      bd: "color-mix(in oklab,var(--pv-positive) 28%,transparent)",
    };
  }
  return {
    label: `Partial ${row.steps_completed}/${TOTAL_STEPS}`,
    fg: "var(--pv-warning-deep)",
    bg: "color-mix(in oklab,var(--pv-warning) 9%,transparent)",
    bd: "color-mix(in oklab,var(--pv-warning) 30%,transparent)",
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
