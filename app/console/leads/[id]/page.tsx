import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STEPS,
  TOTAL_STEPS,
  categoryName,
  formatAnswer,
  visibleFields,
  type Answers,
} from "@/lib/discovery/schema";
import {
  SUBMISSION_DETAIL_SELECT,
  daysUntil,
  formatWhen,
  stateTone,
  type SubmissionRow,
} from "@/lib/console";
import { requireUser } from "@/lib/auth/session";
import { fetchMembers, fetchStages } from "@/lib/console/stages.server";
import { memberName } from "@/lib/console/columns";
import { StageBadge } from "@/app/console/stage-badge";
import { ArrowLeftIcon } from "lucide-react";
import { LogOpen } from "./log-open";
import { EmailClientButton } from "./email-client-button";
import { NotesCard } from "./notes-card";
import { PipelineCard } from "./pipeline-card";
import type { NoteView } from "@/lib/console/notes";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";

export const metadata: Metadata = {
  title: "Lead",
  robots: { index: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EventRow {
  id: number;
  actor: string;
  actor_id: string | null;
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
    .select(SUBMISSION_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  // Independent of each other, so they overlap rather than queue.
  const [ctx, stages, members, { data: events }, { data: noteRows }] =
    await Promise.all([
      requireUser(`/console/leads/${id}`),
      fetchStages(),
      fetchMembers(),
      supabase
        .from("submission_events")
        .select("id, actor, actor_id, action, detail, created_at")
        .eq("submission_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("submission_notes")
        .select("id, body, author_name, created_at")
        .eq("submission_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const notes = (noteRows ?? []) as NoteView[];
  // Resolved once: the activity list would otherwise scan the roster per row.
  const byId = new Map(members.map((m) => [m.id, m]));
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
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-[90px] pt-7 max-sm:px-gutter-sm">
      <LogOpen submissionId={lead.id} />

      <Link
        href="/console"
        className="inline-flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[.1em] text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        <ArrowLeftIcon className="size-3.5" />
        All leads
      </Link>

      <div className="mt-[18px] flex flex-wrap items-end justify-between gap-7">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-ink-muted">
              REF {lead.ref}
            </span>
            <StageBadge slug={lead.lead_stage} stages={stages} />
            {lead.status !== "complete" && (
              <Badge variant={tone.variant} tone="mono" className="gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-current" />
                {tone.label}
              </Badge>
            )}
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
            <EmailClientButton
              email={lead.contact_email}
              subject={`Your Prime PEO Brokers record (REF ${lead.ref})`}
            />
          </div>
        )}
      </div>

      <div className="mt-[26px] grid grid-cols-[1fr_320px] items-start gap-7 [&>*]:min-w-0 max-lg:grid-cols-1">
        <div className="flex flex-col gap-5 max-lg:order-2">
          {STEPS.map((step, i) => (
            <section
              key={step.title}
              data-sensitive={step.sensitive ? "true" : undefined}
              className="group/step overflow-hidden rounded-md border border-line bg-raised data-[sensitive]:border-ink data-[sensitive]:bg-tint"
            >
              <div className="flex items-center justify-between gap-4 border-b border-line bg-sunken px-row-x py-[13px] group-data-[sensitive]/step:border-ink group-data-[sensitive]/step:bg-tint">
                <div className="flex items-baseline gap-[11px]">
                  <span className="font-mono text-[11.5px] text-ink-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-[16.5px] font-semibold">
                    {step.title}
                  </h2>
                </div>
                {step.sensitive && (
                  <Badge
                    variant="outline"
                    tone="mono"
                    className="border-ink text-ink"
                  >
                    Sensitive · logged on open
                  </Badge>
                )}
              </div>
              {/*
                The 1px grid gap is the divider: the wrapper paints the line
                colour and each cell paints the surface over it.
              */}
              <div className="grid grid-cols-2 gap-px bg-line max-sm:grid-cols-1 group-data-[sensitive]/step:bg-ink">
                {visibleFields(i, answers).map((f) => (
                  <div
                    key={f.id}
                    className="bg-raised px-row-x py-4 group-data-[sensitive]/step:bg-tint"
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

          {/*
            Notes and Activity live in the main column, not the 320px rail.
            Four stacked cards there made the rail the longest thing on the
            page, and a note field needs room to write in. Tabs because Notes
            is what people use daily and Activity is what they check
            occasionally, so only one needs to be visible at a time.
          */}
          <Tabs defaultValue="notes" className="gap-0">
            <TabsList>
              <TabsTrigger value="notes">
                Notes{notes.length > 0 ? ` (${notes.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="mt-4">
              <NotesCard submissionId={lead.id} initial={notes} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              {(events ?? []).length === 0 ? (
                <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
                  Nothing recorded yet.
                </div>
              ) : (
                <div className="flex flex-col" data-rows>
                  {(events ?? []).map((h: EventRow) => (
                    <div
                      key={h.id}
                      className="border-b border-sunken py-3.5 last:border-b-0"
                    >
                      <div className="text-[14.5px]">{h.detail || h.action}</div>
                      <div className="mt-1.5 font-mono text-[11.5px] text-ink-muted">
                        {/* actor_id is the reliable attribution; actor is the
                            readable fallback for the visitor and for
                            service-role writes, which have no person. */}
                        {h.actor_id ? memberName(byId.get(h.actor_id)) : h.actor}
                        {" · "}
                        {formatWhen(h.created_at)} UTC
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="flex flex-col gap-5 max-lg:order-1">
          <Card className="gap-0 rounded-md py-row-x">
            <CardContent className="px-row-x">
            <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
              Record
            </div>
            <div className="mt-3 flex flex-col gap-2.5 text-sm">
              <SideRow
                label="Category"
                value={
                  lead.category
                    ? categoryName(lead.category) +
                      (lead.intent === "renewal" ? " · renewal" : "")
                    : "–"
                }
              />
              <SideRow
                label="Steps answered"
                value={`${lead.steps_completed} / ${TOTAL_STEPS}`}
              />
              <SideRow
                label="Started"
                value={formatWhen(lead.created_at)}
              />
              <SideRow
                label="Submitted"
                value={lead.submitted_at ? formatWhen(lead.submitted_at) : "–"}
              />
              {runway && <SideRow label="Renewal pressure" value={runway} />}
            </div>
            </CardContent>
          </Card>

          <PipelineCard
            submissionId={lead.id}
            stage={lead.lead_stage}
            assigneeId={lead.assigned_to}
            stages={stages}
            members={members}
            viewerId={ctx.userId}
          />
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
