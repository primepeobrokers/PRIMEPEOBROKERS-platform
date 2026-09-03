"use client";

import { Loader2Icon } from "lucide-react";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { memberName, type Member } from "@/lib/console/columns";
import { stageLabel, type Stage } from "@/lib/console/stages";
import { setAssignee, setStage } from "./actions";

const UNASSIGNED = "unassigned";

/**
 * Stage and owner for one lead.
 *
 * Optimistic, but honestly so: the control moves immediately, and on failure
 * it snaps back to the value the server still holds and says why. The
 * alternative (waiting for the round trip) makes a two-click triage pass feel
 * broken, and the alternative to rolling back (leaving the optimistic value)
 * would show a state the database does not have.
 */
export function PipelineCard({
  submissionId,
  stage,
  assigneeId,
  stages,
  members,
  viewerId,
}: {
  submissionId: string;
  stage: string;
  assigneeId: string | null;
  stages: Stage[];
  members: Member[];
  viewerId: string;
}) {
  const [stageValue, setStageValue] = useState(stage);
  const [ownerValue, setOwnerValue] = useState(assigneeId ?? UNASSIGNED);
  const [pending, startTransition] = useTransition();

  /*
    Resync when the server sends a new value, so a change made in another tab
    (or by the revalidation these actions trigger) does not leave stale local
    state on screen.

    Adjusting during render rather than in an effect: React re-runs this
    component immediately without committing the intermediate paint, so there
    is no flash of the old value and no cascading render. An effect would
    paint the stale value first, and the lint rule that forbids it is right.
  */
  const [syncedStage, setSyncedStage] = useState(stage);
  if (syncedStage !== stage) {
    setSyncedStage(stage);
    setStageValue(stage);
  }
  const owner = assigneeId ?? UNASSIGNED;
  const [syncedOwner, setSyncedOwner] = useState(owner);
  if (syncedOwner !== owner) {
    setSyncedOwner(owner);
    setOwnerValue(owner);
  }

  const onStage = (next: string) => {
    const previous = stageValue;
    if (next === previous) return;
    setStageValue(next);
    startTransition(async () => {
      const result = await setStage({ submissionId, stage: next });
      if ("error" in result) {
        setStageValue(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`Stage set to ${stageLabel(next, stages)}`);
    });
  };

  const onOwner = (next: string) => {
    const previous = ownerValue;
    if (next === previous) return;
    setOwnerValue(next);
    startTransition(async () => {
      const result = await setAssignee({
        submissionId,
        assigneeId: next === UNASSIGNED ? null : next,
      });
      if ("error" in result) {
        setOwnerValue(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next === UNASSIGNED
          ? "Lead unassigned"
          : `Assigned to ${memberName(members.find((m) => m.id === next))}`,
      );
    });
  };

  /*
    A removed teammate is dropped from the options but kept if they currently
    hold the lead, so the card shows who owns it rather than falling back to a
    blank Select. Picking anyone else then clears them.
  */
  const options = members.filter(
    (m) => !m.deactivated_at || m.id === assigneeId,
  );
  const live = stages.filter((s) => !s.retired || s.slug === stage);

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Pipeline
          {/*
            role="status" so the save is announced, not only shown: the toast
            lives at the bottom corner and the Select the user just operated
            goes disabled underneath them, which otherwise reads as stuck.
          */}
          <span role="status" className="normal-case tracking-normal">
            {pending && (
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <Loader2Icon className="size-3 animate-spin" />
                Saving
              </span>
            )}
          </span>
        </div>

        <div className="mt-3.5 flex flex-col gap-3.5">
          <div>
            <label
              htmlFor="lead-stage"
              className="text-[13px] text-ink-muted"
            >
              Stage
            </label>
            <Select
              value={stageValue}
              onValueChange={onStage}
              disabled={pending}
            >
              <SelectTrigger id="lead-stage" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {live.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.label}
                    {s.retired ? " (retired)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor="lead-owner"
              className="text-[13px] text-ink-muted"
            >
              Owner
            </label>
            <Select
              value={ownerValue}
              onValueChange={onOwner}
              disabled={pending}
            >
              <SelectTrigger id="lead-owner" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {/* Pinned first: taking a lead is the common action. */}
                {options.some((m) => m.id === viewerId) && (
                  <SelectItem value={viewerId}>Me</SelectItem>
                )}
                {options
                  .filter((m) => m.id !== viewerId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {memberName(m)}
                      {m.deactivated_at ? " (removed)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
