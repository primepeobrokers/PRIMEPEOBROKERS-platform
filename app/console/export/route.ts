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
  const [{ data, error }, stages, members] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "ref, status, steps_completed, intent, lead_stage, assigned_to, closed_at, created_at, submitted_at, answers",
      )
      .order("created_at", { ascending: false })
      .limit(10000),
    fetchStages(),
    fetchMembers(),
  ]);
  if (error) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

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
