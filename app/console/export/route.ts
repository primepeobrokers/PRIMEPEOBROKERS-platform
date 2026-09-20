import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEPS, formatAnswer, type Answers } from "@/lib/discovery/schema";
import { memberName } from "@/lib/console/columns";
import { stageLabel } from "@/lib/console/stages";
import { fetchMembers, fetchStages } from "@/lib/console/stages.server";

/**
 * CSV export of the signed-in user's tenant leads. Auth is required and RLS
 * scopes the rows: an unauthenticated request gets a 401, never data.
 *
 * KNOWN LIMITATION: this exports every lead, ignoring the filters active on
 * the list the button sits above, so the file will not match what the person
 * is looking at. Worth changing, but it changes what the button means, so it
 * is a product call rather than a cleanup. Raised with the client.
 */

/** Rows per round trip. Comfortably under PostgREST's server-side cap. */
const EXPORT_BATCH = 500;

/** A hard stop, so a runaway table cannot exhaust the function's memory. */
const EXPORT_MAX = 50_000;

type ExportRow = {
  ref: number;
  status: string;
  steps_completed: number;
  intent: string | null;
  lead_stage: string;
  assigned_to: string | null;
  closed_at: string | null;
  created_at: string;
  submitted_at: string | null;
  answers: unknown;
};

/**
 * Every lead, read in bounded pages.
 *
 * WHY NOT ONE `.limit(10000)`
 *
 * It did not do what it said. PostgREST applies its own server-side row cap
 * (1000 by default) and the SMALLER limit wins, so the export silently
 * stopped at that cap and handed back a file the person believed was
 * complete. No error, no warning, no truncation notice: the worst shape a
 * data-export bug can take.
 *
 * `.range()` pages past it. Each batch is bounded, the loop stops as soon as
 * a short page proves it reached the end, and EXPORT_MAX stops it regardless,
 * so neither the row cap nor an unexpectedly huge table decides the outcome.
 *
 * Ordered by created_at DESC to match the console, with `ref` as a tiebreak:
 * without a unique tiebreak, two rows sharing a timestamp can swap between
 * pages and be exported twice or not at all.
 */
async function fetchAllForExport(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ rows: ExportRow[] } | { error: true }> {
  const rows: ExportRow[] = [];

  while (rows.length < EXPORT_MAX) {
    const { data, error } = await supabase
      .from("submissions")
      .select(
        "ref, status, steps_completed, intent, lead_stage, assigned_to, closed_at, created_at, submitted_at, answers",
      )
      .order("created_at", { ascending: false })
      .order("ref", { ascending: false })
      .range(rows.length, rows.length + EXPORT_BATCH - 1);

    if (error) {
      console.error("[export] batch failed", error);
      return { error: true };
    }
    const batch = (data ?? []) as ExportRow[];
    rows.push(...batch);
    // A short page means there is no next one. Also the exit for an empty table.
    if (batch.length < EXPORT_BATCH) break;
  }

  return { rows };
}
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  /*
    Stage and owner are read alongside the rows so the CSV carries the same
    pipeline state the console shows. Deliberately not a relational select:
    two flat reads keep the row shape flat and do not depend on FK
    introspection through RLS on profiles.
  */
  const [rowsResult, stages, members] = await Promise.all([
    fetchAllForExport(supabase),
    fetchStages(),
    fetchMembers(),
  ]);
  if ("error" in rowsResult) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
  const data = rowsResult.rows;

  const ownerById = new Map(members.map((m) => [m.id, m]));

  const fieldCols = STEPS.flatMap((s) => s.fields.map((f) => f));
  const header = [
    "ref",
    "status",
    "steps_completed",
    "intent",
    "lead_stage",
    "owner",
    "closed_at",
    "created_at",
    "submitted_at",
    ...fieldCols.map((f) => f.id),
  ];

  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const row of data ?? []) {
    const answers = (row.answers ?? {}) as Answers;
    lines.push(
      [
        String(row.ref),
        row.status,
        String(row.steps_completed),
        row.intent ?? "shop",
        // The label, not the slug: a CSV is read by people.
        stageLabel(row.lead_stage, stages),
        row.assigned_to ? memberName(ownerById.get(row.assigned_to)) : "",
        row.closed_at ?? "",
        row.created_at ?? "",
        row.submitted_at ?? "",
        ...fieldCols.map((f) => {
          const v = formatAnswer(f.id, answers);
          return v === "–" ? "" : v;
        }),
      ]
        .map(esc)
        .join(","),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prime-peo-brokers-leads-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
