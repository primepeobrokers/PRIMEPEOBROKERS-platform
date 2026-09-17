"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  PROTECTED_STAGE_SLUG,
  STAGE_TONES,
  STAGE_TONE_LABELS,
  validateStageLabel,
  type Stage,
  type StageTone,
} from "@/lib/console/stages";
import {
  createStage,
  renameStage,
  reorderStages,
  restoreStage,
  retireStage,
} from "./stage-actions";

/**
 * The pipeline editor.
 *
 * Reordering sends the whole ordered list rather than a move delta, so two
 * admins reordering at once end with one of their orders rather than an
 * interleaving of both. Up and down buttons instead of drag and drop: a
 * handful of stages does not justify the dependency, and buttons are
 * keyboard-reachable for free.
 */
export function StagesCard({
  stages,
  counts,
}: {
  stages: Stage[];
  counts: Record<string, number>;
}) {
  const [pending, startTransition] = useTransition();
  // The stage the in-flight mutation belongs to, so its row can show a
  // spinner while every control is disabled. See members-table for the
  // reasoning; it is the same trade.
  const [actingId, setActingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [tone, setTone] = useState<StageTone>("neutral");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [retiring, setRetiring] = useState<Stage | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const live = stages.filter((s) => !s.retired);
  const retired = stages.filter((s) => s.retired);

  const run = (
    fn: () => Promise<{ error: string } | { ok: true; message?: string }>,
    onDone?: () => void,
    onSettled?: () => void,
  ) =>
    startTransition(async () => {
      const result = await fn();
      // onSettled runs on both paths; onDone only on success. The distinction
      // matters: onDone closes the edit form, and closing it on an error would
      // discard the label the user just typed.
      if ("error" in result) {
        toast.error(result.error);
        onSettled?.();
        return;
      }
      toast.success(result.message ?? "Saved.");
      onDone?.();
      onSettled?.();
    });

  const startEdit = (s: Stage) => {
    setEditing(s.id);
    setLabel(s.label);
    setTone(s.tone);
    setError("");
    setAdding(false);
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setLabel("");
    setTone("neutral");
    setError("");
  };

  const saveEdit = (s: Stage) => {
    const problem = validateStageLabel(label, stages, { ignoreId: s.id });
    if (problem) return setError(problem);
    setActingId(s.id);
    run(() => renameStage({ stageId: s.id, label: label.trim(), tone }), () =>
      setEditing(null),
    );
  };

  const saveNew = () => {
    const problem = validateStageLabel(label, stages);
    if (problem) return setError(problem);
    run(() => createStage({ label: label.trim(), tone, terminal: false }), () =>
      setAdding(false),
    );
  };

  /*
    Guarded against the double-click race. `pending` is still false on the
    synchronous click that starts a transition, so two fast clicks both
    computed `next` from the same stale `live` array and the second write
    clobbered the first: the row appeared to move one position instead of two,
    or snapped back. A ref flips synchronously, before React re-renders.
  */
  const inFlight = useRef(false);

  const move = (index: number, delta: number) => {
    if (inFlight.current) return;
    const next = [...live];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setActingId(live[index].id);
    inFlight.current = true;
    run(
      () => reorderStages({ orderedIds: next.map((s) => s.id) }),
      undefined,
      () => {
        inFlight.current = false;
      },
    );
  };

  const toneField = (
    <div>
      <span className="text-[13px] text-ink-muted">Colour</span>
      <Select value={tone} onValueChange={(v) => setTone(v as StageTone)}>
        <SelectTrigger className="mt-1.5 w-full" aria-label="Stage colour">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_TONES.map((t) => (
            <SelectItem key={t} value={t}>
              {STAGE_TONE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <div className="overflow-hidden rounded-md border border-line bg-raised" data-rows>
        {live.map((s, i) => (
          <div
            key={s.id}
            className="border-b border-line px-row-x py-3.5 last:border-b-0"
          >
            {editing === s.id ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor={`stage-${s.id}`}
                    className="text-[13px] text-ink-muted"
                  >
                    Name
                  </label>
                  <Input
                    id={`stage-${s.id}`}
                    value={label}
                    autoFocus
                    onChange={(e) => {
                      setLabel(e.target.value);
                      if (error) setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit(s);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    className="mt-1.5"
                  />
                </div>
                {toneField}
                {error && (
                  <div className="text-[12.5px] text-destructive">{error}</div>
                )}
                <div className="flex gap-2.5">
                  <Button size="sm" disabled={pending} onClick={() => saveEdit(s)}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${s.label} up`}
                      disabled={pending || i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${s.label} down`}
                      disabled={pending || i === live.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDownIcon />
                    </Button>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={s.tone} tone="mono" className="gap-1.5">
                        <span className="h-[5px] w-[5px] rounded-full bg-current" />
                        {s.label}
                      </Badge>
                      {s.isDefault && (
                        <span className="font-mono text-[11px] text-ink-muted">
                          new leads land here
                        </span>
                      )}
                      {s.isTerminal && (
                        <span className="font-mono text-[11px] text-ink-muted">
                          closes the lead
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[11.5px] text-ink-muted">
                      {counts[s.slug] ?? 0} lead{(counts[s.slug] ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {pending && actingId === s.id && (
                    <Loader2Icon
                      aria-label="Saving"
                      className="size-3.5 animate-spin text-ink-muted"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => startEdit(s)}
                  >
                    Rename
                  </Button>
                  {/*
                    The seed stage cannot be retired: submissions.lead_stage
                    defaults to it, so new leads would fail their foreign key.
                    The database refuses it too; hiding the control means
                    nobody has to discover that from an error.
                  */}
                  {s.slug !== PROTECTED_STAGE_SLUG && live.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setMoveTo(
                          live.find((o) => o.id !== s.id)?.slug ?? "",
                        );
                        setRetiring(s);
                      }}
                    >
                      Retire
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="border-t border-line bg-sunken px-row-x py-3.5">
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="stage-new" className="block text-[13px] text-ink-muted">
                  Name
                </label>
                <Input
                  id="stage-new"
                  value={label}
                  autoFocus
                  onChange={(e) => {
                    setLabel(e.target.value);
                    if (error) setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveNew();
                    }
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder="Proposal sent"
                  aria-invalid={error ? true : undefined}
                  className="mt-1.5"
                />
              </div>
              {toneField}
              {error && (
                <div className="text-[12.5px] text-destructive">{error}</div>
              )}
              <div className="flex gap-2.5">
                <Button size="sm" disabled={pending} onClick={saveNew}>
                  Add stage
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={pending}
          onClick={startAdd}
        >
          Add a stage
        </Button>
      )}

      {retired.length > 0 && (
        <div className="mt-6">
          <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
            Retired
          </div>
          <div className="mt-2.5 overflow-hidden rounded-md border border-line bg-sunken">
            {retired.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 border-b border-line px-row-x py-3 last:border-b-0"
              >
                <div className="text-[14px] text-ink-soft">{s.label}</div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setActingId(s.id);
                    run(() => restoreStage({ stageId: s.id }));
                  }}
                >
                  {pending && actingId === s.id && (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  )}
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog
        open={retiring !== null}
        onOpenChange={(open) => !open && setRetiring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire {retiring?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the pipeline. Leads already on it have to move
              somewhere, so pick where they go.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-md border border-line bg-sunken px-4 py-3">
            <div className="text-[13.5px]">
              {retiring ? counts[retiring.slug] ?? 0 : 0} lead
              {(retiring ? counts[retiring.slug] ?? 0 : 0) === 1 ? "" : "s"} move
              to:
            </div>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger className="mt-2 w-full" aria-label="Move leads to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {live
                  .filter((s) => s.id !== retiring?.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.slug}>
                      {s.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !moveTo}
              onClick={() => {
                const target = retiring;
                if (!target) return;
                setRetiring(null);
                setActingId(target.id);
                run(() => retireStage({ stageId: target.id, moveTo }));
              }}
            >
              Retire stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
