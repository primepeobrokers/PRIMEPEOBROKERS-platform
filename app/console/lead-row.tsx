"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { TableCell, TableRow } from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { formatMoney, formatWhen, stateTone, type SubmissionRow } from "@/lib/console";
import type { Stage } from "@/lib/console/stages";
import { StageBadge } from "./stage-badge";
import { categoryName } from "@/lib/discovery/schema";

/**
 * One lead in the table.
 *
 * The company name is the real link, so keyboard and screen-reader users get
 * exactly one obvious target per row. The whole row still navigates on click
 * for pointer users, but a click that lands on the actions menu, or that ends
 * a text selection, is ignored: dragging to copy a reference number should not
 * throw you into the record.
 */
export function LeadRow({
  row,
  stages,
}: {
  row: SubmissionRow;
  stages: Stage[];
}) {
  const router = useRouter();
  const tone = stateTone(row);
  const href = `/console/leads/${row.id}`;

  return (
    <TableRow
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
      className="cursor-pointer"
    >
      <TableCell className="font-mono text-[13px] text-ink-muted">
        {row.ref}
      </TableCell>

      <TableCell>
        <Link
          href={href}
          className="block truncate text-[15px] font-semibold text-ink hover:text-accent-press focus-visible:text-accent-press"
          onClick={(e) => e.stopPropagation()}
        >
          {row.company_name || "Unnamed company"}
        </Link>
        <div className="mt-[3px] truncate text-[13px] text-ink-muted">
          {row.contact_name || row.contact_email || "No contact yet"}
        </div>
      </TableCell>

      <TableCell className="text-right font-mono text-sm">
        {row.fte_count ?? "–"}
      </TableCell>

      <TableCell className="text-right font-mono text-sm">
        {formatMoney(row.benefits_spend)}
      </TableCell>

      <TableCell>
        {row.category ? (
          <span className="flex items-center gap-1.5">
            <Badge variant="neutral" tone="mono">
              {categoryName(row.category)}
            </Badge>
            {row.intent === "renewal" && (
              <Badge variant="accent" tone="mono" title="Benchmarking an existing deal">
                Renewal
              </Badge>
            )}
          </span>
        ) : (
          <span className="text-sm text-ink-faint">–</span>
        )}
      </TableCell>

      <TableCell className="font-mono text-[13px] text-ink-muted">
        {formatWhen(row.submitted_at ?? row.created_at)}
      </TableCell>

      {/*
        Stage and capture state share one cell. They are two different axes
        (where the team has taken the lead, and how much of the form the
        visitor finished) but both read as "status", and the table is
        table-fixed with no room for a ninth column. Stage leads because it is
        the one staff act on; the capture state sits under it in the quieter
        voice, and only when it is still partial.
      */}
      <TableCell>
        <StageBadge slug={row.lead_stage} stages={stages} />
        {row.status !== "complete" && (
          <div className="mt-[3px] font-mono text-[11.5px] text-ink-muted">
            {tone.label}
          </div>
        )}
      </TableCell>

      <TableCell className="w-px" data-row-actions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${row.company_name || `lead ${row.ref}`}`}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => router.push(href)}>
              Open lead
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(String(row.ref));
                  toast.success(`Reference ${row.ref} copied`);
                } catch {
                  // Optional chaining used to hide this failure entirely.
                  toast.error("Could not reach the clipboard", {
                    description: `Reference is ${row.ref}`,
                    duration: 10000,
                  });
                }
              }}
            >
              Copy reference
            </DropdownMenuItem>
            {row.contact_email && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={`mailto:${row.contact_email}?subject=${encodeURIComponent(
                      `Your Prime PEO Brokers record (REF ${row.ref})`,
                    )}`}
                  >
                    Email contact
                  </a>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
