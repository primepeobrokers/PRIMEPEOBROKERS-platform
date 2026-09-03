"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";

/**
 * Sign out, behind a confirmation.
 *
 * The trigger sits next to the account initials in a dense header, so it is
 * easy to hit by accident. Signing out is not destructive, but access here is
 * by invitation and re-entry means finding the invite email, which is enough
 * friction to be worth one question first.
 *
 * useTransition keeps the pending state honest: the server action redirects,
 * so the spinner must persist until navigation happens rather than resolving
 * on its own.
 */
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {/*
          Padded to a real hit area. This was a bare text button roughly 15px
          tall: the smallest target in the console, and it signs you out.
        */}
        <button
          type="button"
          className="-mx-2 cursor-pointer rounded-sm px-2 py-2.5 text-[12.5px] text-ink-faint transition-colors duration-150 hover:text-dark-ink"
        >
          Sign out
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display tracking-[-.015em]">
            Sign out of the console?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Any lead you have open will stay exactly as it is. Access is by
            invitation, so you will need your invite link to sign back in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              // Keep the dialog open while the redirect is in flight, so the
              // pending state stays visible instead of flashing shut.
              e.preventDefault();
              startTransition(() => action());
            }}
          >
            {pending && <Loader2Icon className="size-4 animate-spin" />}
            {pending ? "Signing out" : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
