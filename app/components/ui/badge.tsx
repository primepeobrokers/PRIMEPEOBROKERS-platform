import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
 "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
 "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
 "bg-destructive text-white focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/90",
        outline:
 "border-border text-foreground [a&]:hover:bg-accent-subtle [a&]:hover:text-accent-subtle-foreground",
        ghost: "[a&]:hover:bg-accent-subtle [a&]:hover:text-accent-subtle-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        /*
          Status colourways. These replace per-row inline style objects: the
          console reads a submission's state and picks a variant, so a badge
          colour is a token lookup instead of three colour strings in JS.
        */
        positive:
          "border-[var(--pv-tone-positive-bd)] bg-[var(--pv-tone-positive-bg)] text-[var(--pv-tone-positive-fg)]",
        warning:
          "border-[var(--pv-tone-warning-bd)] bg-[var(--pv-tone-warning-bg)] text-[var(--pv-tone-warning-fg)]",
        accent:
          "border-[var(--pv-tone-accent-bd)] bg-[var(--pv-tone-accent-bg)] text-[var(--pv-tone-accent-fg)]",
        neutral:
          "border-[var(--pv-tone-neutral-bd)] bg-[var(--pv-tone-neutral-bg)] text-[var(--pv-tone-neutral-fg)]",
      },
      /* Mono uppercase is the console's data voice; sans is the page voice. */
      tone: {
        sans: "",
        mono: "font-mono text-[10.5px] uppercase tracking-[0.07em]",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "sans",
    },
  }
)

function Badge({
  className,
  variant = "default",
  tone = "sans",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
