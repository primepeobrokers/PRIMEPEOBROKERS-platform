import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV export of consent records: counsel's "exportable" requirement.
 *
 * Every column counsel listed, including the full consent wording on every
 * row. That makes the file wide, and it is deliberate: a record that says
 * "terms v2026-10-17" proves nothing on its own if the wording behind that
 * date is ever edited in place, whereas the sentence itself does.
 *
 * RLS decides the rows (migration 0015): Prime's own team only, never a
 * partner's portal login, because these carry IP addresses and user agents.
 * A signed-in partner gets an empty file, not an error, which is the same
 * shape RLS gives every other table.
 */

const EXPORT_BATCH = 500;
const EXPORT_MAX = 100_000;

type ConsentRow = {
  submission_id: string;
  submission_ref: number | null;
  consented_at: string;
  ip_address: string | null;
  user_agent: string | null;
  tenant_id: string;
  partner_name: string | null;
  terms_version: string;
  privacy_version: string;
  terms_accepted: boolean;
  terms_text: string;
  sms_consented: boolean;
  sms_phone: string | null;
  sms_text: string;
  submit_notice_text: string;
  sms_opted_out_at: string | null;
  sms_opt_out_source: string | null;
};

const COLUMNS = [
  "submission_id",
  "submission_ref",
  "consented_at",
  "ip_address",
  "user_agent",
  "tenant_id",
  "partner_name",
  "terms_version",
  "privacy_version",
  "terms_accepted",
  "terms_text",
  "sms_consented",
  "sms_phone",
  "sms_text",
  "submit_notice_text",
  "sms_opted_out_at",
  "sms_opt_out_source",
] as const satisfies ReadonlyArray<keyof ConsentRow>;

/**
 * Quoted, with spreadsheet formulas neutralised.
 *
 * user_agent and the phone number are visitor-supplied, and a CSV opened in
 * Excel or Sheets evaluates a cell beginning with = + - @ as a formula. A
 * leading apostrophe makes it text. Applied to every cell rather than
 * guessing which columns a visitor can reach.
 */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // Paged for the reason spelled out in app/console/export/route.ts: one big
  // .limit() is silently capped by PostgREST.
  const rows: ConsentRow[] = [];
  while (rows.length < EXPORT_MAX) {
    const { data, error } = await supabase
      .from("consent_records")
      .select(COLUMNS.join(", "))
      .order("consented_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + EXPORT_BATCH - 1);
    if (error) {
      console.error("[consent export] batch failed", error);
      return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
    const batch = (data ?? []) as unknown as ConsentRow[];
    rows.push(...batch);
    if (batch.length < EXPORT_BATCH) break;
  }

  const lines = [COLUMNS.map(cell).join(",")];
  for (const row of rows) lines.push(COLUMNS.map((c) => cell(row[c])).join(","));

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prime-peo-brokers-consent-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
