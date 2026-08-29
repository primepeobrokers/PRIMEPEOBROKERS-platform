"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
  Toasts, pinned to the brand.

  The stock shadcn wrapper reads the theme from next-themes. This project is
  deliberately single-theme (the guide defines one palette and globals.css
  declares color-scheme: light), so that indirection bought nothing and pulled
  in a dependency the app does not otherwise use. Theme is hard-set to light.

  Position is bottom-right: the console's primary actions sit top-right, and a
  toast that covers the button you just pressed hides the thing you are most
  likely to press again.
*/
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "font-sans",
          title: "text-[14px] font-semibold",
          description: "text-[13px] text-ink-muted",
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--pv-surface-raised)",
          "--normal-text": "var(--pv-ink)",
          "--normal-border": "var(--pv-line)",
          "--success-bg": "var(--pv-surface-raised)",
          "--success-text": "var(--pv-positive-deep)",
          "--success-border": "var(--pv-tone-positive-bd)",
          "--error-bg": "var(--pv-surface-raised)",
          "--error-text": "var(--pv-danger)",
          "--error-border": "color-mix(in oklab, var(--pv-danger) 30%, transparent)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
