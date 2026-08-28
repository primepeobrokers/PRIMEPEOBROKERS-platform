import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEPS, formatAnswer, type Answers } from "@/lib/discovery/schema";

/**
 * CSV export of the signed-in user's tenant leads. Auth is required and RLS
 * scopes the rows — an unauthenticated request gets a 401, never data.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("ref, status, steps_completed, created_at, submitted_at, answers")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  const fieldCols = STEPS.flatMap((s) => s.fields.map((f) => f));
  const header = [
    "ref",
    "status",
    "steps_completed",
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
        row.created_at ?? "",
        row.submitted_at ?? "",
        ...fieldCols.map((f) => {
          const v = formatAnswer(f.id, answers);
          return v === "—" ? "" : v;
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
