"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";

/**
 * CSV export.
 *
 * A plain <a href> gave no sign the export had started and, because the route
 * answers errors as JSON, a failure navigated the broker away from the console
 * to a page of raw JSON. Fetching instead keeps them here: the button holds a
 * pending state, a failure becomes a toast, and the file is handed over as a
 * blob only once the response is known good.
 *
 * Up to 10,000 rows, so the wait is real and needs to be shown.
 */
export function ExportCsvButton({
  href = "/console/export",
  label = "Export CSV",
}: {
  /** The route that answers with the CSV. The consent export reuses this button. */
  href?: string;
  label?: string;
} = {}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        if (pending) return; // never fire two exports at once
        setPending(true);
        const toastId = toast.loading("Preparing your export…");
        try {
          const res = await fetch(href);
          if (!res.ok) {
            const msg =
              res.status === 401
                ? "Your session expired. Sign in and try again."
                : "The export did not complete. Nothing was changed.";
            toast.error("Export failed", { id: toastId, description: msg });
            return;
          }

          const blob = await res.blob();
          if (blob.size === 0) {
            toast.error("Export was empty", {
              id: toastId,
              description: "There were no rows to export.",
            });
            return;
          }

          // Filename from the route's Content-Disposition when it sets one.
          const disposition = res.headers.get("content-disposition") ?? "";
          const match = disposition.match(/filename="?([^";]+)"?/i);
          const name =
            match?.[1] ??
            `prime-peo-leads-${new Date().toISOString().slice(0, 10)}.csv`;

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          // Revoke on the next tick so the download has taken the handle.
          setTimeout(() => URL.revokeObjectURL(url), 0);

          toast.success("Export ready", {
            id: toastId,
            description: name,
          });
        } catch {
          toast.error("Export failed", {
            id: toastId,
            description: "Check your connection and try again.",
          });
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
      {pending ? "Exporting" : label}
    </Button>
  );
}
