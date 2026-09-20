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

  const [members, stages, { data: eventRows }] = await Promise.all([
    fetchMembers(),
    fetchStages(),
    supabase
      .from("tenant_events")
      .select("id, actor, actor_id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const events = (eventRows ?? []) as TenantEventRow[];
  const byId = new Map(members.map((m) => [m.id, m]));

  /*
    Per-owner and per-stage counts, as counts rather than rows.

    This used to be `select("assigned_to, lead_stage")` with no limit, tallied
    in JS. Two problems. It transferred every submission row in the tenant on
    every render of this screen, to produce a handful of integers. Worse,
    PostgREST caps an unbounded select (1000 rows by default), silently and
    without an error, so past that cap the tallies would be computed from a
    partial sample.

    That matters more here than anywhere else in the app: `leadCounts` is what
    the remove-teammate dialog uses to tell an admin how many leads a removal
    will move. An undercount tells them a destructive action is cheaper than
    it is.

    `head: true` returns no rows, just the count. Both loops are bounded by the
    team roster and the stage list (single digits), and every request is
    concurrent, so this is a handful of parallel index counts.
    `submissions_tenant_assigned_idx` and `submissions_tenant_stage_idx`
    (0005) cover the two predicates.
  */
  const countFor = (column: "assigned_to" | "lead_stage", value: string) =>
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .then(({ count }) => [value, count ?? 0] as const);

  const [ownerCounts, stageTallies] = await Promise.all([
    Promise.all(members.map((m) => countFor("assigned_to", m.id))),
    Promise.all(stages.map((s) => countFor("lead_stage", s.slug))),
  ]);

  const leadCounts = new Map<string, number>(ownerCounts);
  const stageCounts = new Map<string, number>(stageTallies);

  const active = members.filter((m) => !m.deactivated_at);
  const removed = members.filter((m) => m.deactivated_at);

  return (
    <main className="pv-page mx-auto max-w-[1400px] px-gutter pb-20 pt-8 max-sm:px-gutter-sm">
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

        {/*
          Sticky on wide screens: the invite form is the action most often
          wanted while reading the members table, and it used to scroll out of
          reach as soon as the stage list grew. The console header is not
          sticky (app/console/layout.tsx), so there is nothing to clear and a
          small top gap is all this needs. Released below lg, where the column
          stacks and sticking it would pin a card over the content.
        */}
        <aside className="flex flex-col gap-7 lg:sticky lg:top-6 max-lg:order-first">
          <InviteCard />

          <section>
            <h2 className="font-display text-[19px] font-semibold tracking-[-.015em]">
              Team activity
            </h2>
            {/*
              Scrolls inside a fixed height rather than setting the page's.

              This is a log: it only ever grows, and every row is the same
              low-value-per-row shape. Rendered at full height it decided how
              tall the whole page was, so twenty entries left the left column
              ending near 1000px against a sidebar running past 1300px, and
              the page grew a little longer with each partner edit. Capping it
              keeps the page a fixed size no matter how busy the team is, and
              the newest entries (the only ones anyone reads) stay in view.
            */}
            <div
              className="mt-3.5 max-h-[420px] overflow-y-auto overscroll-contain rounded-md border border-line bg-raised"
              data-rows
            >
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
