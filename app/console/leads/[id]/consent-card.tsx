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
 * What the visitor agreed to, and whether they may be called or texted.
 *
 * The call/text line is the one an advisor acts on, so it leads with the
 * instruction ("Do not call or text") rather than the record. Without
 * consent, or after a STOP, automated calls and texts are off; a manual call
 * about their own request is a separate question this card does not answer.
 *
 * No SMS provider is wired up yet, so a STOP reply arrives on whichever phone
 * the advisor texted from. Recording it here is how it reaches the record,
 * and it applies to the number across every lead that consented with it.
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
  const canText = consent?.smsConsented === true && !optedOut;

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Consent
        </div>

        {!consent ? (
          <p className="mt-2 text-[13px] leading-snug text-ink-muted">
            No consent on file. Drafts, call requests and leads from before
            October 2026 have none, so do not text or autodial this lead.
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
              <div className="text-[13px] text-ink-muted">Calls and texts</div>
              {canText ? (
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
                    Record STOP / opt-out
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="destructive" tone="mono" className="mt-1.5">
                    Do not call or text
                  </Badge>
                  <div className="mt-1.5 text-[12.5px] text-ink-muted">
                    {optedOut
                      ? `Opted out ${when.optedOutAt} UTC.`
                      : "No call or text consent was given."}
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
              Record an opt-out for {consent?.smsPhone}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this when they reply STOP or ask not to be called or texted.
              It applies to this number on every lead, is kept with the
              consent record, and cannot be undone here: renewed consent has to
              come from a new submission.
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
