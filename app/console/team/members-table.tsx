"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { memberName, type Member } from "@/lib/console/columns";
import { changeRole, removeTeammate, restoreTeammate } from "./actions";

const UNASSIGNED = "unassigned";

/**
 * The roster, with role and removal controls.
 *
 * Every guard here is duplicated server-side, and the server one is the real
 * check: these disable a control so the person is not invited to do something
 * that will fail, not to enforce anything. The last-admin rule in particular
 * is counted in the database under a lock, because counting peers is not
 * something a policy or a disabled button can guarantee.
 */
export function MembersTable({
  members,
  viewerId,
  leadCounts,
}: {
  members: Member[];
  viewerId: string;
  leadCounts: Record<string, number>;
}) {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [reassignTo, setReassignTo] = useState<string>(UNASSIGNED);

  const active = members.filter((m) => !m.deactivated_at);
  const removed = members.filter((m) => m.deactivated_at);
  const admins = active.filter((m) => m.role === "admin");

  const run = (fn: () => Promise<{ error: string } | { ok: true; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
    });

  return (
    <>
      <div className="overflow-hidden rounded-md border border-line bg-raised">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead className="w-[92px] text-right">Leads</TableHead>
              <TableHead className="w-[110px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((m) => {
              const isViewer = m.id === viewerId;
              // Disabled when they are the only admin left: the server refuses
              // it too, and a control that always errors is worse than none.
              const lastAdmin = m.role === "admin" && admins.length <= 1;
              /*
                Say why, on the row itself. The note below the table only
                appears when the team is a single person, so on a four-person
                team with one admin that admin saw both of their own controls
                greyed out with no explanation anywhere.
              */
              const lockedReason = lastAdmin
                ? "This is the only admin on the team. Promote someone else first."
                : isViewer
                  ? "You cannot change your own role or remove yourself."
                  : undefined;
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="text-[14.5px] font-semibold">
                      {memberName(m)}
                      {isViewer && (
                        <span className="ml-2 font-mono text-[11px] font-normal text-ink-muted">
                          you
                        </span>
                      )}
                    </div>
                    <div className="mt-[3px] truncate text-[13px] text-ink-muted">
                      {m.email ?? "No address on file"}
                    </div>
                    {lockedReason && (
                      <div className="mt-1.5 text-[12px] leading-snug text-ink-faint">
                        {lockedReason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      disabled={pending || isViewer || lastAdmin}
                      onValueChange={(v) =>
                        run(() =>
                          changeRole({
                            profileId: m.id,
                            role: v === "admin" ? "admin" : "member",
                          }),
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Role for ${memberName(m)}`}
                        title={lockedReason}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {leadCounts[m.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={lockedReason}
                      disabled={pending || isViewer || lastAdmin}
                      onClick={() => {
                        setReassignTo(UNASSIGNED);
                        setRemoving(m);
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {active.length === 1 && (
        <p className="mt-2.5 text-[12.5px] leading-normal text-ink-muted">
          You are the only person on the team, so your own role and removal are
          locked. Invite someone else first.
        </p>
      )}

      {removed.length > 0 && (
        <div className="mt-6">
          <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
            Removed
          </div>
          <div className="mt-2.5 overflow-hidden rounded-md border border-line bg-sunken">
            {removed.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-4 border-b border-line px-row-x py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink-soft">
                    {memberName(m)}
                  </div>
                  <div className="mt-[2px] truncate text-[12.5px] text-ink-muted">
                    {m.email ?? ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <Badge variant="neutral" tone="mono">
                    No access
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => restoreTeammate({ profileId: m.id }))}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-normal text-ink-muted">
            Their notes and history stay on every lead they touched. Restoring
            gives their account access again.
          </p>
        </div>
      )}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing ? memberName(removing) : "this teammate"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access immediately. Their notes and history stay on
              every lead they worked, and you can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {removing && (leadCounts[removing.id] ?? 0) > 0 && (
            <div className="rounded-md border border-line bg-sunken px-4 py-3">
              <div className="text-[13.5px]">
                They own {leadCounts[removing.id]} lead
                {leadCounts[removing.id] === 1 ? "" : "s"}. Move{" "}
                {leadCounts[removing.id] === 1 ? "it" : "them"} to:
              </div>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="mt-2 w-full" aria-label="Reassign leads to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>
                    Leave unassigned
                  </SelectItem>
                  {active
                    .filter((m) => m.id !== removing.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {memberName(m)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                const target = removing;
                if (!target) return;
                setRemoving(null);
                run(() =>
                  removeTeammate({
                    profileId: target.id,
                    reassignTo: reassignTo === UNASSIGNED ? null : reassignTo,
                  }),
                );
              }}
            >
              Remove from team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
