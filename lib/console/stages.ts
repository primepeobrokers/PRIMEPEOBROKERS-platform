import { createClient } from "@/lib/supabase/server";

/**
 * Lead stages: the Phase 2 pipeline.
 *
 * Unlike the discovery questions in lib/discovery/schema.ts, stages are
 * runtime data, not a config module: the SOW requires the client to add,
 * rename, reorder and retire them without a developer. So this file holds the
 * types, the reader and the pure helpers, and the list itself lives in the
 * lead_stages table (supabase/migrations/0005_team_and_leads.sql).
 *
 * The important invariant, enforced by a trigger in that migration: `slug` is
 * immutable and `label` is what renames. submissions.lead_stage stores the
 * slug, so renaming a stage relabels every lead at once, rewrites no rows, and
 * leaves ?stage=contacted links working.
 */

/**
 * Badge colourways. These are Badge variant names from
 * app/components/ui/badge.tsx, backed by --pv-tone-* tokens in globals.css,
 * and the DB constrains the column to exactly this set.
 *
 * There are four, and an admin can create more than four stages, so two
 * stages may share a colour. That is fine: the badge always renders its label
 * and carries a bg-current dot, so colour is never the only signal. The
 * alternative (a colour value per stage) would put hex codes in the database
 * and break the rule that colours are defined once as tokens.
 */
export const STAGE_TONES = ["neutral", "accent", "warning", "positive"] as const;
export type StageTone = (typeof STAGE_TONES)[number];

/** Labels for the tone picker. Semantic, not colour names: an admin is
 *  choosing what a stage means, and the palette is not theirs to redefine. */
export const STAGE_TONE_LABELS: Record<StageTone, string> = {
  neutral: "Neutral",
  accent: "Active",
  warning: "Attention",
  positive: "Won",
};

export function isStageTone(v: unknown): v is StageTone {
  return typeof v === "string" && (STAGE_TONES as readonly string[]).includes(v);
}

export interface Stage {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  isDefault: boolean;
  isTerminal: boolean;
  tone: StageTone;
  retired: boolean;
}

/** Slugs seeded by migration 0005, for copy and for the protected-seed rule. */
export const SEED_STAGE_SLUGS = [
  "new",
  "in-progress",
  "contacted",
  "closed",
] as const;

/**
 * submissions.lead_stage carries a column default of 'new' from migration
 * 0001, and the discovery flow inserts without naming a stage. That makes the
 * 'new' slug undeletable: retiring it would leave the default pointing at a
 * stage that no longer satisfies the foreign key. The stage editor hides the
 * retire control for it rather than letting the database refuse the write.
 */
export const PROTECTED_STAGE_SLUG = "new";

const STAGE_SELECT =
  "id, slug, label, sort_order, is_default, is_terminal, tone, retired_at";

interface StageRow {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_default: boolean;
  is_terminal: boolean;
  tone: string;
  retired_at: string | null;
}

function toStage(r: StageRow): Stage {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    sortOrder: r.sort_order,
    isDefault: r.is_default,
    isTerminal: r.is_terminal,
    tone: isStageTone(r.tone) ? r.tone : "neutral",
    retired: r.retired_at !== null,
  };
}

/**
 * The caller's tenant stages, ordered as the pipeline reads.
 *
 * Includes retired stages: a lead may still be sitting on one, and its label
 * has to keep rendering. Callers that offer a choice filter on `retired`
 * themselves; callers that display a value should not.
 *
 * Returns [] rather than throwing on error. A stage list that fails to load
 * should degrade the console to unlabelled badges, not blank the leads page,
 * and every read is already tenant-scoped by RLS.
 */
export async function fetchStages(): Promise<Stage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_stages")
    .select(STAGE_SELECT)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error || !data) return [];
  return (data as StageRow[]).map(toStage);
}

/** The stages an admin may assign a lead to right now. */
export function selectableStages(stages: Stage[]): Stage[] {
  return stages.filter((s) => !s.retired);
}

/** Slugs for parseLeadFilters, including retired ones so an existing filter
 *  URL keeps working until the person changes it. */
export function stageSlugs(stages: Stage[]): string[] {
  return stages.map((s) => s.slug);
}

export function findStage(slug: string, stages: Stage[]): Stage | undefined {
  return stages.find((s) => s.slug === slug);
}

/**
 * Display label for a slug that may no longer exist.
 *
 * Falls back to the slug itself rather than to a placeholder: a lead showing
 * "in-progress" is odd but truthful, whereas one showing "Unknown" hides the
 * fact that it is on a stage someone deleted out from under it.
 */
export function stageLabel(slug: string, stages: Stage[]): string {
  return findStage(slug, stages)?.label ?? slug;
}

export function stageTone(slug: string, stages: Stage[]): StageTone {
  return findStage(slug, stages)?.tone ?? "neutral";
}

/** The stage a new lead lands on, for copy and for optimistic UI. */
export function defaultStage(stages: Stage[]): Stage | undefined {
  return stages.find((s) => s.isDefault && !s.retired);
}

/**
 * Slug from an admin-typed label. Called once, at create time, and never
 * again: renames edit the label only.
 */
export function slugifyStage(label: string): string {
  return label
    .normalize("NFKD")
    // Strip combining marks so "Prêt" becomes "pret" rather than losing the e.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    // A trailing hyphen can reappear after the length cut.
    .replace(/-+$/g, "");
}

/**
 * Validation for the stage editor. Returns "" when the label is usable, or the
 * message to show. Mirrors validateField in lib/discovery/schema.ts: the
 * client calls it for immediate feedback and the server calls it again,
 * because client validation is a convenience and never the guard.
 */
export function validateStageLabel(
  label: string,
  existing: Stage[],
  opts: { ignoreId?: string } = {},
): string {
  const trimmed = label.trim();
  if (!trimmed) return "Give the stage a name.";
  if (trimmed.length > 60) {
    return `That is ${trimmed.length} characters. Keep it to 60 or fewer.`;
  }

  const others = existing.filter((s) => s.id !== opts.ignoreId);

  if (others.some((s) => s.label.toLowerCase() === trimmed.toLowerCase())) {
    return "There is already a stage with that name.";
  }

  // Only relevant when creating, since a rename does not touch the slug. A
  // collision here would otherwise surface as a unique-constraint error.
  if (!opts.ignoreId) {
    const slug = slugifyStage(trimmed);
    if (!slug) {
      return "Use at least a couple of letters or numbers in the name.";
    }
    if (others.some((s) => s.slug === slug)) {
      return "That is too close to an existing stage name.";
    }
  }

  return "";
}
