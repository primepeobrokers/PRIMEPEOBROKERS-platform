"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon, SendIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
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
import { routeLead } from "@/app/console/partners/actions";

export interface RouteTarget {
  id: string;
  name: string;
  isHouse: boolean;
}

/**
 * Routes a lead to another partner: the SOW's "ability to reassign or route a
 * submission between partners".
 *
 * Behind a confirmation, because this is the one control in the console that
 * moves data across the isolation boundary. After it runs, the destination
 * partner can read this lead and its whole history, and the origin partner
 * cannot. That is not recoverable by an undo button, only by routing it back,
 * which leaves both moves in the audit trail.
 *
 * Rendered only for platform staff, and only when a partner exists to route
 * to. A partner's own admin never sees it.
 */
export function RouteCard({
  submissionId,
  currentTenantId,
  targets,
}: {
  submissionId: string;
  currentTenantId: string;
  targets: RouteTarget[];
}) {
  const [to, setTo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const options = targets.filter((t) => t.id !== currentTenantId);
  if (options.length === 0) return null;

  const target = options.find((t) => t.id === to);
  const current = targets.find((t) => t.id === currentTenantId);

  const run = () => {
    startTransition(async () => {
      const result = await routeLead({ submissionId, toTenantId: to });
      setConfirming(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTo("");
      toast.success(result.message ?? "Lead routed.");
    });
  };

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Route to
        </div>

        <p className="mt-2 text-[12.5px] text-ink-muted">
          Currently with {current?.name ?? "this team"}. Moving it takes its
          notes and history along.
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          <Select value={to} onValueChange={setTo} disabled={pending}>
            <SelectTrigger className="w-full cursor-pointer" aria-label="Destination partner">
              <SelectValue placeholder="Choose a partner" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t.id} value={t.id} className="cursor-pointer">
                  {t.name}
                  {t.isHouse ? " (your team)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="secondary"
            disabled={pending || !to}
            onClick={() => setConfirming(true)}
            className="w-fit cursor-pointer"
          >
            {pending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" aria-hidden="true" />
            )}
            Route lead
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[-.015em]">
              Route this lead to {target?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.name} will be able to see this lead and everything
              written about it. {current?.name ?? "The current owner"} will no
              longer see it at all. Its stage moves to the closest match in
              {" "}
              {target?.name}&rsquo;s pipeline, and its owner is cleared unless
              they are on your team.
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
              Route lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
