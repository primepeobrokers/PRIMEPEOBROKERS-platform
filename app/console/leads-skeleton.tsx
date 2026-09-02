import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

/**
 * Loading state for the leads table. It mirrors the real column widths and row
 * height so the layout does not shift when data lands: a skeleton that changes
 * size on resolve is worse than no skeleton at all.
 */
export function LeadsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-raised">
      <div className="hidden max-md:block">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="border-b border-sunken px-gutter-sm py-4 last:border-b-0">
            <Skeleton className="h-4 w-[52%]" />
            <Skeleton className="mt-2 h-3 w-[34%]" />
            <div className="mt-3 flex gap-1.5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-14" />
            </div>
            <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-sunken pt-3">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
        ))}
      </div>
      <div className="max-md:hidden">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[76px]">Ref</TableHead>
            <TableHead className="w-[38%]">Company</TableHead>
            <TableHead className="w-[84px] text-right">Heads</TableHead>
            <TableHead className="w-[126px] text-right">Benefits spend</TableHead>
            <TableHead className="w-[186px]">Category</TableHead>
            <TableHead className="w-[136px]">Submitted</TableHead>
            <TableHead className="w-[128px]">Status</TableHead>
            <TableHead className="w-[52px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell><Skeleton className="h-4 w-9" /></TableCell>
              <TableCell>
                <Skeleton className="h-4 w-[46%]" />
                <Skeleton className="mt-2 h-3 w-[30%]" />
              </TableCell>
              <TableCell><Skeleton className="ml-auto h-4 w-7" /></TableCell>
              <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-5 w-14" /></TableCell>
              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20" /></TableCell>
              <TableCell><Skeleton className="size-7" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
