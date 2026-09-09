import Link from "next/link";
import { InboxIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requireTenantUser } from "@/lib/tenant/resolve";
import {
  SUBMISSION_LIST_SELECT,
  formatMoney,
  formatWhen,
  type SubmissionRow,
} from "@/lib/console";
import { fetchStages } from "@/lib/console/stages.server";
import { categoryName } from "@/lib/discovery/schema";
import { StageBadge } from "@/app/console/stage-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty";

/**
 * A partner's own leads. Read-only by design.
 *
 * The SOW: "Partner-facing interface kept deliberately minimal. Partners need
 * visibility, not workflow tooling." So there is no stage editor, no
 * assignment, no notes, no export and no filters. Prime PEO's team works the
 * leads in the console; the partner watches them arrive.
 *
 * No tenant filter in the query, and that is not an omission: RLS scopes
 * every read to tenant_scope(), which for a partner user is exactly their own
 * tenant. Adding `.eq("tenant_id", ...)` here would imply the boundary lives
 * in this file, which is the misconception the SOW warns against ("enforcing
 * at the data access layer, not just in the UI").
 */
export default async function PortalPage() {
  const { tenant } = await requireTenantUser();
  const supabase = await createClient();

  const [{ data }, stages] = await Promise.all([
    supabase
      .from("submissions")
      .select(SUBMISSION_LIST_SELECT)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(100),
    fetchStages(),
  ]);

  const rows = (data ?? []) as SubmissionRow[];
  const company = tenant.branding.companyName ?? tenant.name;

  return (
    <main className="mx-auto max-w-[1100px] px-7 py-9 max-sm:px-[18px] max-sm:py-6">
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-semibold tracking-[-.02em] text-ink">
          Your leads
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          Every enquiry captured through {company}. Prime PEO Brokers works
          each one and keeps its status up to date here.
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty className="rounded-lg border border-line bg-raised py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No leads yet</EmptyTitle>
            <EmptyDescription>
              Enquiries completed on your site will appear here, newest first.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-[13px] text-ink-muted">
                    {row.ref}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/portal/leads/${row.id}`}
                      className="block truncate rounded-sm text-[15px] font-semibold text-ink outline-none hover:text-accent-press focus-visible:text-accent-press focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {row.company_name || "Unnamed company"}
                    </Link>
                    <div className="mt-[3px] truncate text-[13px] text-ink-muted">
                      {row.contact_name || row.contact_email || "No contact yet"}
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-ink-soft">
                    {row.category ? categoryName(row.category) : "–"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.fte_count ?? "–"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMoney(row.benefits_spend)}
                  </TableCell>
                  <TableCell>
                    <StageBadge slug={row.lead_stage} stages={stages} />
                  </TableCell>
                  <TableCell className="text-[13px] text-ink-muted">
                    {formatWhen(row.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
