"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchStages } from "@/lib/console/stages.server";
import {
  PROTECTED_STAGE_SLUG,
  isStageTone,
  slugifyStage,
  validateStageLabel,
  type StageTone,
} from "@/lib/console/stages";

/**
 * The stage editor. Admin only, and RLS enforces that independently: the
 * insert and update policies on lead_stages both require is_admin().
 *
 * The invariants that could take the discovery funnel offline (never retire
 * the default, never retire the last stage, never rewrite a slug) live in a
 * database trigger, not here. A settings screen must not be able to break the
 * public form, and the only way to guarantee that is to make it impossible at
 * the data layer rather than merely unlikely in the UI.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StageResult = { error: string } | { ok: true; message?: string };

function revalidateStages(): void {
  revalidatePath("/console/team");
  revalidatePath("/console");
  revalidatePath("/console/leads/[id]", "page");
}

/** Adds a stage at the end of the pipeline. */
export async function createStage(input: {
  label: string;
  tone: StageTone;
  terminal: boolean;
}): Promise<StageResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const label = String(input.label ?? "").trim();
  const tone = isStageTone(input.tone) ? input.tone : "neutral";
  const terminal = input.terminal === true;

  const stages = await fetchStages();
  // Revalidated server-side. The client runs the same function for immediate
  // feedback, but that is a convenience and never the guard.
  const problem = validateStageLabel(label, stages);
  if (problem) return { error: problem };

  const slug = slugifyStage(label);
  const supabase = await createClient();
  const { error } = await supabase.from("lead_stages").insert({
    tenant_id: ctx.tenantId,
    slug,
    label,
    tone,
    is_terminal: terminal,
    // Append: one past the current highest, leaving room to reorder.
    sort_order: (stages.at(-1)?.sortOrder ?? 0) + 10,
  });
  if (error) {
    console.error("[stages] create failed", error);
    return { error: "Could not add that stage." };
  }

  revalidateStages();
  return { ok: true, message: `${label} added.` };
}

/** Renames a stage and sets its colourway. The slug never changes. */
export async function renameStage(input: {
  stageId: string;
  label: string;
  tone: StageTone;
}): Promise<StageResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };

  const stageId = String(input.stageId ?? "");
  const label = String(input.label ?? "").trim();
  const tone = isStageTone(input.tone) ? input.tone : "neutral";
  if (!UUID_RE.test(stageId)) return { error: "That stage is not valid." };

  const stages = await fetchStages();
  const problem = validateStageLabel(label, stages, { ignoreId: stageId });
  if (problem) return { error: problem };

  const supabase = await createClient();
  /*
    label and tone only. Renaming deliberately does not touch the slug, which
    a trigger makes immutable anyway: submissions.lead_stage stores the slug,
    so a rename relabels every lead at once, rewrites no rows, and leaves
    ?stage=contacted links working.
  */
  const { error } = await supabase
    .from("lead_stages")
    .update({ label, tone })
    .eq("id", stageId);
  if (error) {
    console.error("[stages] rename failed", error);
    return { error: "Could not rename that stage." };
  }

  revalidateStages();
  return { ok: true };
}

/**
 * Reorders the pipeline.
 *
 * Takes the full ordered list rather than a move delta, which makes it
 * idempotent and immune to two admins reordering at once: the last write
 * wins cleanly instead of interleaving into an order neither of them chose.
 * For a handful of stages that is the right trade, and it is why sort_order
 * is deliberately not unique (a bulk renumber passes through collisions).
 */
export async function reorderStages(input: {
  orderedIds: string[];
}): Promise<StageResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };

  const ids = Array.isArray(input.orderedIds) ? input.orderedIds.map(String) : [];
  if (ids.length === 0) return { ok: true };
  if (ids.some((id) => !UUID_RE.test(id))) {
    return { error: "That ordering is not valid." };
  }

  const stages = await fetchStages();
  const known = new Set(stages.map((s) => s.id));
  if (ids.some((id) => !known.has(id))) {
    return { error: "That ordering refers to a stage that no longer exists." };
  }

  const supabase = await createClient();
  // Sequential rather than parallel: a handful of rows, and a partial failure
  // is easier to reason about when the order of writes is known.
  for (const [i, id] of ids.entries()) {
    const { error } = await supabase
      .from("lead_stages")
      .update({ sort_order: (i + 1) * 10 })
      .eq("id", id);
    if (error) {
      console.error("[stages] reorder failed", error);
      return { error: "Could not save the new order." };
    }
  }

  revalidateStages();
  return { ok: true };
}

/**
 * Retires a stage, moving everything on it to another one first.
 *
 * moveTo is required rather than optional: a lead left pointing at a retired
 * stage would still render, but it would sit outside the pipeline with no
 * obvious way back, and the person retiring the stage is the one who knows
 * where its leads belong.
 */
export async function retireStage(input: {
  stageId: string;
  moveTo: string;
}): Promise<StageResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };
  const { ctx } = guard;

  const stageId = String(input.stageId ?? "");
  const moveTo = String(input.moveTo ?? "").trim();
  if (!UUID_RE.test(stageId)) return { error: "That stage is not valid." };
  if (!moveTo) return { error: "Choose where to move the existing leads." };

  const stages = await fetchStages();
  const target = stages.find((s) => s.id === stageId);
  const destination = stages.find((s) => s.slug === moveTo);
  if (!target) return { error: "That stage no longer exists." };
  if (!destination || destination.retired) {
    return { error: "Pick a stage that is still in use." };
  }
  if (destination.slug === target.slug) {
    return { error: "Pick a different stage to move the leads to." };
  }
  if (target.slug === PROTECTED_STAGE_SLUG) {
    return {
      error:
        "New leads land on this stage, so it cannot be retired. Rename it instead.",
    };
  }

  const supabase = await createClient();

  /*
    Move the leads first. If the retire then fails, the leads have simply
    moved, which is recoverable and visible. Retiring first would leave leads
    stranded on a stage no longer offered anywhere.

    Each move fires the 0005 trigger, so every lead gets its own activity
    entry rather than the change happening invisibly.
  */
  const { data: moved, error: moveError } = await supabase
    .from("submissions")
    .update({ lead_stage: destination.slug })
    .eq("lead_stage", target.slug)
    .select("id");
  if (moveError) {
    console.error("[stages] moving leads failed", moveError);
    return { error: "Could not move the leads off that stage." };
  }

  const { error } = await supabase
    .from("lead_stages")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", stageId);
  if (error) {
    // The trigger raises a readable message for the two cases that matter
    // (the default stage, the last remaining stage), so surface it.
    const raw = error.message ?? "";
    if (raw.includes("Cannot retire")) return { error: raw };
    console.error("[stages] retire failed", error);
    return { error: "Could not retire that stage." };
  }

  const count = moved?.length ?? 0;
  await logStageEvent(
    ctx,
    "stage_retired",
    count > 0
      ? `${target.label} retired, ${count} lead${count === 1 ? "" : "s"} moved to ${destination.label}`
      : `${target.label} retired`,
  );

  revalidateStages();
  return {
    ok: true,
    message:
      count > 0
        ? `${target.label} retired. ${count} lead${count === 1 ? "" : "s"} moved to ${destination.label}.`
        : `${target.label} retired.`,
  };
}

/** Brings a retired stage back into the pipeline. */
export async function restoreStage(input: {
  stageId: string;
}): Promise<StageResult> {
  const guard = await guardAction("admin");
  if (!guard.ok) return { error: guard.error };

  const stageId = String(input.stageId ?? "");
  if (!UUID_RE.test(stageId)) return { error: "That stage is not valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_stages")
    .update({ retired_at: null })
    .eq("id", stageId);
  if (error) {
    console.error("[stages] restore failed", error);
    return { error: "Could not restore that stage." };
  }

  revalidateStages();
  return { ok: true };
}

async function logStageEvent(
  ctx: { userId: string; email: string; fullName: string | null; tenantId: string },
  action: string,
  detail: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("tenant_events").insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      actor: ctx.fullName || ctx.email || "staff",
      action,
      detail,
    });
  } catch (e) {
    console.error("[stages] audit write failed", e);
  }
}
