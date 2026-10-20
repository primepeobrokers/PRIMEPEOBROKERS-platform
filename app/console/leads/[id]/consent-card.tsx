"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon, PhoneOffIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { recordSmsOptOut } from "./actions";

/** The parts of a consent_records row the card shows. */
export interface ConsentView {
  consentedAt: string;
  termsVersion: string;
  privacyVersion: string;
  smsConsented: boolean;
  smsPhone: string | null;
  smsOptedOutAt: string | null;
}

/**
 * What the visitor agreed to, and whether they consented to calls.
 *
 * Calls only: Prime does not text clients (client decision, 20 Oct 2026), so
 * there is no STOP or HELP handling. A visitor withdraws call consent by
 * telling their advisor or emailing Prime, as section 7 of the privacy policy
 * says; recording it here is how that reaches the record, and it applies to
 * the number across every lead that consented with it.
 *
 * The card states the record ("No call consent") rather than issuing an
 * instruction: whether a lead who asked for a call but left the box unticked
 * may be called is the client's call, not this card's.
 */
export function ConsentCard({
  submissionId,
  consent,
  when,
}: {
  submissionId: string;
  consent: ConsentView | null;
  /** Pre-formatted by the server so the card and the page agree on time format. */
  when: { consentedAt: string; optedOutAt: string | null };
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const result = await recordSmsOptOut({ submissionId });
      setConfirming(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
    });
  };

  const optedOut = consent?.smsOptedOutAt != null;
  const canCall = consent?.smsConsented === true && !optedOut;

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Consent
        </div>

        {!consent ? (
          <p className="mt-2 text-[13px] leading-snug text-ink-muted">
            No consent on file. Drafts, call requests and leads from before
            October 2026 have none.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <div>
              <div className="text-[13px] text-ink-muted">Terms and privacy</div>
              <div className="mt-1 font-mono text-[13px]">
                Agreed {when.consentedAt} UTC
              </div>
              <div className="mt-0.5 font-mono text-[12px] text-ink-muted">
                Terms {consent.termsVersion} · Privacy {consent.privacyVersion}
              </div>
            </div>

            <div>
              <div className="text-[13px] text-ink-muted">Calls</div>
              {canCall ? (
                <>
                  <div className="mt-1 font-mono text-[13px]">
                    Consented · {consent.smsPhone}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirming(true)}
                    className="mt-2.5 w-fit cursor-pointer"
                  >
                    {pending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PhoneOffIcon className="size-4" aria-hidden="true" />
                    )}
                    Record call opt-out
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="destructive" tone="mono" className="mt-1.5">
                    No call consent
                  </Badge>
                  <div className="mt-1.5 text-[12.5px] text-ink-muted">
                    {optedOut
                      ? `Withdrawn ${when.optedOutAt} UTC.`
                      : "The call consent box was not ticked."}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[-.015em]">
              Record a call opt-out for {consent?.smsPhone}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this when they withdraw consent to calls, by telling their
              advisor or emailing admin@primepeobrokers.com. It applies to this
              number on every lead, is kept with the consent record, and cannot
              be undone here: renewed consent has to come from a new
              submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              Record opt-out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
