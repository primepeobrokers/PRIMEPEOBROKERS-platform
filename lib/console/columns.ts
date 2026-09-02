/**
 * The submissions columns the console projects, in one place.
 *
 * These were previously two hand-typed select strings (the leads list and the
 * lead detail page) that had to stay in lockstep with SubmissionRow by eye.
 * They had already drifted apart once. Adding lead_stage and assigned_to in
 * Phase 2 is exactly the change that makes a third copy a matter of time.
 *
 * Kept as a tuple rather than a bare string so a reviewer can diff it against
 * the interface line by line, and so scripts/check-columns.mts can assert the
 * two agree at runtime. TypeScript cannot check a string literal against an
 * interface, which is the gap that lets a typo'd column reach production as a
 * PostgREST error rather than a build failure.
 */
export const SUBMISSION_LIST_COLUMNS = [
  "id",
  "ref",
  "status",
  "steps_completed",
  "company_name",
  "contact_name",
  "contact_email",
  "fte_count",
  "benefits_spend",
  "current_setup",
  "category",
  "intent",
  "lead_stage",
  "assigned_to",
  "created_at",
  "submitted_at",
] as const;

export const SUBMISSION_LIST_SELECT = SUBMISSION_LIST_COLUMNS.join(", ");

/** The detail view needs the full answers blob on top of the list columns. */
export const SUBMISSION_DETAIL_SELECT = `${SUBMISSION_LIST_SELECT}, answers`;

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
  /** Slug into lead_stages for this tenant. See lib/console/stages.ts. */
  lead_stage: string;
  /** Owning teammate's profile id, null when unassigned. */
  assigned_to: string | null;
  created_at: string;
  submitted_at: string | null;
}

/**
 * Compile-time half of the parity check: every key of SubmissionRow must be a
 * member of the tuple above, so adding a field to the interface without adding
 * the column is a type error here. The runtime half (tuple entries that have
 * no matching key) lives in scripts/check-columns.mts, which needs the values
 * rather than the types.
 */
export const SUBMISSION_ROW_KEYS: Record<
  keyof SubmissionRow,
  (typeof SUBMISSION_LIST_COLUMNS)[number]
> = {
  id: "id",
  ref: "ref",
  status: "status",
  steps_completed: "steps_completed",
  company_name: "company_name",
  contact_name: "contact_name",
  contact_email: "contact_email",
  fte_count: "fte_count",
  benefits_spend: "benefits_spend",
  current_setup: "current_setup",
  category: "category",
  intent: "intent",
  lead_stage: "lead_stage",
  assigned_to: "assigned_to",
  created_at: "created_at",
  submitted_at: "submitted_at",
};

/** One row of the tenant roster, used by the assignee picker and filters. */
export interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "member";
  deactivated_at: string | null;
}

export const MEMBER_SELECT = "id, full_name, email, role, deactivated_at";

/** Display name for a teammate, falling back through the fields we hold. */
export function memberName(m: Member | undefined | null): string {
  if (!m) return "Unassigned";
  return m.full_name?.trim() || m.email || "Unknown";
}
