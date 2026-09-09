import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requireTenantUser } from "@/lib/tenant/resolve";
import {
  SUBMISSION_DETAIL_SELECT,
  formatMoney,
  formatWhen,
} from "@/lib/console";
import { fetchStages } from "@/lib/console/stages.server";
import {
  STEPS,
  formatAnswer,
  visibleFields,
  type Answers,
} from "@/lib/discovery/schema";
import { StageBadge } from "@/app/console/stage-badge";

/**
 * One lead, read-only.
 *
 * A partner sees what was submitted and where it has got to. Working the lead
 * (stage, owner, notes) is the client's job and lives in the console, per the
 * SOW's "visibility, not workflow tooling".
 *
 * Isolation is RLS's, not this file's: a partner requesting another tenant's
 * submission id gets no row back and therefore a 404, because the SELECT
 * policy scopes to tenant_scope(). The UUID in the URL is not a secret and
 * does not need to be.
 */
export default async function PortalLeadPage({
  params,
}: PageProps<"/portal/leads/[id]">) {
  await requireTenantUser();
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: lead }, stages] = await Promise.all([
    supabase
      .from("submissions")
      .select(SUBMISSION_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle(),
    fetchStages(),
  ]);

  if (!lead) notFound();

  const answers = (lead.answers ?? {}) as Answers;

  return (
    <main className="mx-auto max-w-[900px] px-7 py-9 max-sm:px-[18px] max-sm:py-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-muted outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon className="size-3.5" />
        All leads
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold tracking-[-.02em] text-ink">
            {lead.company_name || "Unnamed company"}
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            <span className="font-mono">#{lead.ref}</span>
            {" · received "}
            {formatWhen(lead.created_at)}
          </p>
        </div>
        <StageBadge slug={lead.lead_stage} stages={stages} />
      </header>

      <dl className="mt-6 grid grid-cols-3 gap-x-6 gap-y-5 max-sm:grid-cols-2">
        <Fact label="Contact" value={lead.contact_name} />
        <Fact label="Email" value={lead.contact_email} />
        <Fact label="Employees" value={lead.fte_count?.toString()} mono />
        <Fact label="Benefits spend" value={formatMoney(lead.benefits_spend)} mono />
        <Fact label="Current setup" value={lead.current_setup} />
      </dl>

      <div className="mt-9 space-y-7">
        {STEPS.map((step, i) => {
          const fields = visibleFields(i, answers).filter(
            (f) => formatAnswer(f.id, answers) !== "",
          );
          if (fields.length === 0) return null;

          return (
            <section key={step.title}>
              <h2 className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
                {step.title}
              </h2>
              <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-raised">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3"
                  >
                    <dt className="min-w-[220px] flex-1 text-[13.5px] text-ink-muted">
                      {f.label}
                    </dt>
                    <dd className="text-[14px] text-ink">
                      {formatAnswer(f.id, answers)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-[14px] text-ink${mono ? " font-mono" : ""}`}
      >
        {value || "–"}
      </dd>
    </div>
  );
}
