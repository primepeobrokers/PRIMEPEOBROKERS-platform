import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/console";
import { memberName, type Member } from "@/lib/console/columns";
import { fetchMembers, fetchStages } from "@/lib/console/stages.server";
import { InviteCard } from "./invite-card";
import { MembersTable } from "./members-table";
import { StagesCard } from "./stages-card";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false },
};

interface TenantEventRow {
  id: number;
  actor: string;
  actor_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

/**
 * Team and pipeline settings.
 *
 * requireAdminPage uses notFound() rather than redirecting a member to
 * /console: someone who guesses the URL should not learn whether the route
 * exists, and the 404 renders inside the console shell instead of throwing
 * them out of the app.
 */
export default async function TeamPage() {
  const ctx = await requireAdminPage();
  const supabase = await createClient();

  const [members, stages, { data: eventRows }, { data: loadRows }] =
    await Promise.all([
      fetchMembers(),
      fetchStages(),
      supabase
        .from("tenant_events")
        .select("id, actor, actor_id, action, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      // Per-owner counts, so removing someone can say what it will move.
      supabase.from("submissions").select("assigned_to, lead_stage"),
    ]);

  const events = (eventRows ?? []) as TenantEventRow[];
  const byId = new Map(members.map((m) => [m.id, m]));

  const leadCounts = new Map<string, number>();
  const stageCounts = new Map<string, number>();
  for (const row of (loadRows ?? []) as {
    assigned_to: string | null;
    lead_stage: string;
  }[]) {
    if (row.assigned_to) {
      leadCounts.set(row.assigned_to, (leadCounts.get(row.assigned_to) ?? 0) + 1);
    }
    stageCounts.set(row.lead_stage, (stageCounts.get(row.lead_stage) ?? 0) + 1);
  }

  const active = members.filter((m) => !m.deactivated_at);
  const removed = members.filter((m) => m.deactivated_at);

  return (
    <main className="mx-auto max-w-[1400px] px-gutter pb-20 pt-8 max-sm:px-gutter-sm">
      <div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-.022em]">
          Team
        </h1>
        <div className="mt-2 font-mono text-[12.5px] text-ink-muted">
          {active.length} active · {active.filter((m) => m.role === "admin").length}{" "}
          admin{active.filter((m) => m.role === "admin").length === 1 ? "" : "s"}
          {removed.length > 0 ? ` · ${removed.length} removed` : ""}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_340px] items-start gap-7 [&>*]:min-w-0 max-lg:grid-cols-1">
        <div className="flex flex-col gap-7">
          <section>
            <h2 className="font-display text-[19px] font-semibold tracking-[-.015em]">
              Members
            </h2>
            <div className="mt-3.5">
              <MembersTable
                members={members}
                viewerId={ctx.userId}
                leadCounts={Object.fromEntries(leadCounts)}
              />
            </div>
          </section>

          <section>
            <h2 className="font-display text-[19px] font-semibold tracking-[-.015em]">
              Lead stages
            </h2>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
              The pipeline every lead moves through. Renaming a stage relabels
              it everywhere at once and keeps existing links working.
            </p>
            <div className="mt-3.5">
              <StagesCard
                stages={stages}
                counts={Object.fromEntries(stageCounts)}
              />
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-7 max-lg:order-first">
          <InviteCard />

          <section>
            <h2 className="font-display text-[19px] font-semibold tracking-[-.015em]">
              Team activity
            </h2>
            <div className="mt-3.5 rounded-md border border-line bg-raised">
              {events.length === 0 ? (
                <div className="px-gutter-sm py-[13px] text-sm text-ink-muted">
                  Nothing yet.
                </div>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className="border-b border-sunken px-gutter-sm py-[13px] last:border-b-0"
                  >
                    <div className="text-sm">{e.detail || e.action}</div>
                    <div className="mt-1 font-mono text-[11.5px] text-ink-muted">
                      {e.actor_id
                        ? memberName(byId.get(e.actor_id) as Member | undefined)
                        : e.actor}
                      {" · "}
                      {formatWhen(e.created_at)} UTC
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
