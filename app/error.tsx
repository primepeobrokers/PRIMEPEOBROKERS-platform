"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PlugZapIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { LegalDisclosure } from "@/app/components/legal-disclosure";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty";

/**
 * The route error boundary.
 *
 * Next requires this to be a client component: it takes `reset`, which is a
 * function, and it has to re-render in place when the user retries. That is
 * the one thing here that genuinely needs the client, so nothing else in the
 * tree pays for it.
 *
 * No logo and no tenant read. This renders when rendering itself has failed,
 * and getTenant touches headers and the database, so calling it here risks
 * throwing inside the boundary that exists to catch throwing. A plain
 * wordmark-free frame always renders.
 *
 * Reset first, because most failures here are transient and the visitor keeps
 * their place. The homepage link is the escape hatch when it is not.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what correlates this screen with the server log.
    console.error("[error boundary]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <main className="mx-auto flex w-full max-w-[820px] flex-1 items-center px-10 py-16 max-sm:px-5">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="frame-danger">
              <PlugZapIcon />
            </EmptyMedia>
            <EmptyTitle className="font-display text-[clamp(23px,3.4vw,30px)] font-semibold tracking-[-.02em]">
              Something went wrong at our end.
            </EmptyTitle>
            <EmptyDescription>
              Nothing you submitted was lost. Trying again usually clears it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-md flex-row flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/">Back to the homepage</Link>
            </Button>
          </EmptyContent>
          {error.digest ? (
            <div className="font-mono text-[11px] uppercase tracking-[.1em] text-ink-faint">
              Reference {error.digest}
            </div>
          ) : null}
        </Empty>
      </main>

      {/* No partner named: the tenant is not read here (see above), and the
          sentence that remains is accurate on every host. */}
      <footer className="border-t border-line">
        <LegalDisclosure
          partnerLegalName={null}
          className="mx-auto max-w-[820px] px-10 py-7 max-sm:px-5"
        />
      </footer>
    </div>
  );
}
