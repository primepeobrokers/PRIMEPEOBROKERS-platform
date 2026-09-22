"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-line", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        /*
          h-11 is a row MINIMUM, not a fixed height.

          Tightening --pv-row-y to 10px buys about two more rows per screen on
          a two-line lead row, which is what this console is scanned for. But
          a single-line row (a partner name, a stage) then measured 38px,
          under the 44px floor for a comfortable hit target, and those rows
          are clickable.

          In the CSS table model `height` on a tr is treated as a minimum:
          the row grows past it when its content is taller. So a single-line
          row comes back to 44px while a two-line row stays at 56.6px, and the
          density gain survives exactly where it was worth having.

          It has to live here, not on the cell: min-height has no effect on
          display:table-cell, which is why the obvious version silently did
          nothing. Verified in a browser, not assumed.
        */
        "h-11 border-b border-sunken transition-colors duration-150 hover:bg-sunken has-aria-expanded:bg-sunken data-[state=selected]:bg-sunken",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-auto bg-sunken px-row-x py-3 text-left align-middle font-mono text-[10.5px] font-normal uppercase tracking-[0.11em] whitespace-nowrap text-ink-muted [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-row-x py-row-y align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
