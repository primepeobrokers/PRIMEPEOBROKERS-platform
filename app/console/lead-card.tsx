"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import {
  formatMoney,
  formatWhen,
  stateTone,
  type SubmissionRow,
} from "@/lib/console";
import { categoryName } from "@/lib/discovery/schema";

/**
 * Mobile presentation of a lead. A fixed-layout table cannot reflow into
 * something readable at 390px, so below the table breakpoint each record
 * becomes a card: the whole card is one link, which is unambiguous on touch
 * and needs no separate actions menu.
 */
export function LeadCard({ row }: { row: SubmissionRow }) {
  const tone = stateTone(row);

  return (
    <Link
      href={`/console/leads/${row.id}`}
      className="block border-b border-sunken px-gutter-sm py-4 transition-colors duration-150 last:border-b-0 active:bg-tint"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {row.company_name || "Unnamed company"}
          </div>
          <div className="mt-[3px] truncate text-[13px] text-ink-muted">
            {row.contact_name || row.contact_email || "No contact yet"}
          </div>
        </div>
        <ChevronRightIcon className="mt-1 size-4 shrink-0 text-ink-faint" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={tone.variant} tone="mono" className="gap-1.5">
          <span className="h-[5px] w-[5px] rounded-full bg-current" />
          {tone.label}
        </Badge>
        {row.category && (
          <Badge variant="neutral" tone="mono">
            {categoryName(row.category)}
          </Badge>
        )}
        {row.intent === "renewal" && (
          <Badge variant="accent" tone="mono">
            Renewal
          </Badge>
        )}
      </div>

      <dl className="mt-3.5 grid grid-cols-3 gap-x-3 gap-y-3 border-t border-sunken pt-3 [&>*]:min-w-0 max-[380px]:grid-cols-2">
        <Field label="Ref" value={String(row.ref)} />
        <Field label="Heads" value={row.fte_count == null ? "–" : String(row.fte_count)} />
        <Field label="Spend" value={formatMoney(row.benefits_spend)} />
      </dl>
      <div className="mt-2.5 font-mono text-[11.5px] text-ink-faint">
        {formatWhen(row.submitted_at ?? row.created_at)} UTC
      </div>
    </Link>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-[13.5px]">{value}</dd>
    </div>
  );
}
