"use client";

import { useState } from "react";

/** Copies the public discovery-flow URL to the clipboard. */
export function CopyDiscoveryLink({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            `${window.location.origin}/discovery`,
          );
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "Link copied" : "Copy discovery link"}
    </button>
  );
}
