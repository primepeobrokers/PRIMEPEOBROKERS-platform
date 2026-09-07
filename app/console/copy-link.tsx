"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * Copies the public discovery-flow URL to the clipboard.
 *
 * The button label still confirms inline, because that is the feedback closest
 * to the thing you clicked. The toast carries the URL itself, so a broker
 * pasting it into an email can see what they actually copied.
 *
 * Clipboard access fails for real reasons: an insecure origin, a browser that
 * withholds permission, or a page that lost focus mid-write. That used to be
 * swallowed, so the button simply did nothing. Now it surfaces the URL to copy
 * by hand.
 */
export function CopyDiscoveryLink({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={cn(
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      disabled={busy}
      onClick={async () => {
        if (busy) return; // double-click should not fire two writes
        setBusy(true);
        const url = `${window.location.origin}/discovery`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success("Discovery link copied", { description: url });
          setTimeout(() => setCopied(false), 2200);
        } catch {
          toast.error("Could not reach the clipboard", {
            description: url,
            duration: 10000,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {copied ? (
        <>
          <CheckIcon className="size-4" />
          Link copied
        </>
      ) : (
        <>
          <LinkIcon className="size-4" />
          Copy discovery link
        </>
      )}
    </button>
  );
}
