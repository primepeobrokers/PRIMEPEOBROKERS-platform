import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STEPS, formatAnswer, type Answers } from "@/lib/discovery/schema";
import {
  daysUntil,
  formatWhen,
  stateTone,
  type SubmissionRow,
} from "@/lib/console";
import { LogOpen } from "./log-open";

export const metadata: Metadata = {
  title: "Lead",
  robots: { index: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EventRow {
  id: number;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export default async function LeadDetailPage(
  props: PageProps<"/console/leads/[id]">,
) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("submissions")
    .select(
      "id, ref, status, steps_completed, answers, company_name, contact_name, contact_email, fte_count, benefits_spend, current_setup, created_at, submitted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: events } = await supabase
    .from("submission_events")
    .select("id, actor, action, detail, created_at")
    .eq("submission_id", id)
    .order("created_at", { ascending: false })
    .limit(12);

  const answers = (lead.answers ?? {}) as Answers;
  const tone = stateTone(lead as SubmissionRow);
  const when = formatWhen(lead.submitted_at ?? lead.created_at);

  // Renewal runway from the renewal date, when the visitor gave one.
  const contractEnd = answers["renewalDate"];
  let runway: string | null = null;
  if (typeof contractEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(contractEnd)) {
    const days = daysUntil(contractEnd);
    runway = days >= 0 ? `${days} days out` : `${-days} days past`;
  }

  return (
    <main
      className="mx-auto max-w-[1400px] px-7 pb-[90px] pt-[26px] max-sm:px-[18px]"
      style={{ animation: "pv-in 250ms var(--pv-ease) both" }}
    >
      <LogOpen submissionId={lead.id} />

      <Link
        href="/console"
        className="font-mono text-[11.5px] uppercase tracking-[.1em] text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        ← All leads
      </Link>

      <div className="mt-[18px] flex flex-wrap items-end justify-between gap-7">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-ink-muted">
              REF {lead.ref}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-[2px] px-[7px] py-1 font-mono text-[10.5px] uppercase tracking-[.07em]"
              style={{
                color: tone.fg,
                background: tone.bg,
                border: `1px solid ${tone.bd}`,
              }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: tone.fg }}
              />
              {tone.label}
            </span>
          </div>
          <h1 className="mt-3 font-display text-[clamp(26px,3.4vw,33px)] font-semibold tracking-[-.024em]">
            {lead.company_name || "Unnamed company"}
          </h1>
          <div className="mt-2 text-[14.5px] text-ink-soft">
            {[
              lead.contact_name,
              lead.contact_email,
              `${lead.status === "complete" ? "submitted" : "last saved"} ${when} UTC`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {lead.contact_email && (
          <div className="flex gap-2.5">
            <a
              href={`mailto:${lead.contact_email}?subject=Your%20Prime%20Vantage%20record%20(REF%20${lead.ref})`}
              className="rounded-[4px] border border-accent bg-accent px-4 py-[11px] text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
            >
              Email the client
            </a>
          </div>
        )}
      </div>

      <div className="mt-[26px] grid grid-cols-[1fr_320px] items-start gap-7 max-lg:grid-cols-1">
        <div className="flex flex-col gap-5 max-lg:order-2">
          {STEPS.map((step, i) => (
            <section
              key={step.title}
              className="overflow-hidden rounded-[4px]"
              style={{
                background: step.sensitive ? "#FBFAF8" : "#FFF",
                border: `1px solid ${step.sensitive ? "#1A1917" : "#DFDAD3"}`,
              }}
            >
              <div
                className="flex items-center justify-between gap-4 px-5 py-[13px]"
                style={{
                  background: step.sensitive ? "#EFEDE9" : "#EAE6E1",
                  borderBottom: `1px solid ${step.sensitive ? "#1A1917" : "#DFDAD3"}`,
                }}
              >
                <div className="flex items-baseline gap-[11px]">
                  <span className="font-mono text-[11.5px] text-ink-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-[16.5px] font-semibold">
                    {step.title}
                  </h2>
                </div>
                {step.sensitive && (
                  <span className="rounded-[2px] border border-ink px-[7px] py-[3px] font-mono text-[10px] uppercase tracking-[.1em]">
                    Sensitive · logged on open
                  </span>
                )}
              </div>
              <div
                className="grid grid-cols-2 gap-px max-sm:grid-cols-1"
                style={{ background: step.sensitive ? "#1A1917" : "#DFDAD3" }}
              >
                {step.fields.map((f) => (
                  <div
                    key={f.id}
                    className="px-5 py-[15px]"
                    style={{ background: step.sensitive ? "#FBFAF8" : "#FFF" }}
                  >
                    <div className="text-[13px] text-ink-muted">{f.label}</div>
                    <div className="mt-1.5 font-mono text-[15px] leading-snug">
                      {formatAnswer(f.id, answers)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-5 max-lg:order-1">
          <div className="rounded-[4px] border border-line bg-raised p-5">
            <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
              Record
            </div>
            <div className="mt-3 flex flex-col gap-2.5 text-sm">
              <SideRow label="Steps answered" value={`${lead.steps_completed} / 6`} />
              <SideRow
                label="Started"
                value={formatWhen(lead.created_at)}
              />
              <SideRow
                label="Submitted"
                value={lead.submitted_at ? formatWhen(lead.submitted_at) : "—"}
              />
              {runway && <SideRow label="Renewal pressure" value={runway} />}
            </div>
          </div>

          <div className="overflow-hidden rounded-[4px] border border-line bg-raised">
            <div className="border-b border-line bg-sunken px-[18px] py-3 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
              Record history
            </div>
            {(events ?? []).length === 0 && (
              <div className="px-[18px] py-[13px] text-sm text-ink-muted">
                Nothing yet.
              </div>
            )}
            {(events ?? []).map((h: EventRow) => (
              <div key={h.id} className="border-b border-sunken px-[18px] py-[13px] last:border-b-0">
                <div className="text-sm">{h.detail || h.action}</div>
                <div className="mt-1 font-mono text-[11.5px] text-ink-muted">
                  {h.actor} · {formatWhen(h.created_at)}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[4px] border border-line bg-raised p-5">
            <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
              Assigned
            </div>
            <div className="mt-3 text-[14.5px] font-semibold">Unassigned</div>
            <div className="mt-3 text-[13px] leading-normal text-ink-muted">
              Assignment and the status pipeline arrive in Phase 2.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="font-mono text-[13px]">{value}</span>
    </div>
  );
}
