"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { createPartner } from "./actions";

/**
 * Add a partner, in a modal.
 *
 * WHY A DIALOG AND NOT AN INLINE CARD
 *
 * This form used to sit permanently above the partner list, open and empty.
 * Creating a partner is a rare act (the roster is single digits to low tens
 * and each entry is permanent), while reading the list and issuing logins is
 * the daily one, so the rare task was occupying the top of the screen and
 * pushing the common one below it. A trigger button costs one click and gives
 * the list the space.
 *
 * Dialog, not AlertDialog: this is a task, not a decision. It can be
 * abandoned harmlessly, so it gets a close button, Escape and click-outside.
 * See app/components/ui/dialog.tsx for why the two are kept separate.
 *
 * Same internals as before: local state per field, useTransition for pending,
 * a plain object into a typed action, a discriminated result rendered inline.
 * No form element, no FormData.
 *
 * The slug is derived from the name as you type but stays editable, because it
 * becomes a permanent subdomain: "Acme Brokers & Co" should suggest
 * "acme-brokers-co" rather than making someone work out the rules, but the
 * client may want "acme".
 */
export function CreatePartnerDialog({ apexHost }: { apexHost: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /** Mirrors the tenants.slug constraint: ^[a-z0-9-]{2,63}$ */
  const suggest = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63);

  const onName = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(suggest(v));
  };

  const reset = () => {
    setName("");
    setSlug("");
    setContactEmail("");
    setInviteEmail("");
    setSlugEdited(false);
    setError("");
  };

  const submit = () => {
    if (pending || !name.trim() || !slug.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await createPartner({ slug, name, contactEmail, inviteEmail });
      if ("error" in result) {
        // Stays open on failure: the message belongs next to the fields that
        // caused it, and closing would throw away everything they typed.
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      toast.success(result.message ?? "Partner created.");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A create that is mid-flight must not be dismissed: the action is
        // already running and closing would orphan its result.
        if (pending) return;
        // Clear on close, so reopening is a fresh form rather than a
        // half-finished one from ten minutes ago.
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-fit cursor-pointer">
          <PlusIcon className="size-4" aria-hidden="true" />
          Add a partner
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-[620px]"
        // The close button is hidden while a create is in flight, to match
        // onOpenChange above. Without this the X stays clickable and looks
        // broken when it does nothing.
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Add a partner</DialogTitle>
          <DialogDescription>
            Their pipeline is set up automatically. Add a logo and colours from
            their row once created.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="partner-name" className="block text-[13px] text-ink-soft">
              Company name
            </label>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Acme Brokers"
              disabled={pending}
              autoFocus
              className="mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="partner-slug" className="block text-[13px] text-ink-soft">
              Portal subdomain
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="partner-slug"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="acme"
                disabled={pending}
                className="font-mono"
              />
              <span className="shrink-0 font-mono text-[13px] text-ink-faint">
                .{apexHost}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              Permanent: it is the partner&rsquo;s address and cannot be changed
              later. Lowercase letters, numbers and hyphens.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="partner-contact" className="block text-[13px] text-ink-soft">
                Partner email
              </label>
              <Input
                id="partner-contact"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="ops@acme.com"
                disabled={pending}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12.5px] text-ink-muted">
                Gets every new lead, and replies from their leads.
              </p>
            </div>
            <div>
              <label htmlFor="partner-invite" className="block text-[13px] text-ink-soft">
                First login
              </label>
              <Input
                id="partner-invite"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Optional, often the same"
                disabled={pending}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12.5px] text-ink-muted">
                Sent an invite to their portal right away.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending} className="cursor-pointer">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={pending || !name.trim() || !slug.trim()}
            className="cursor-pointer"
          >
            {pending && <Loader2Icon className="size-4 animate-spin" />}
            Create partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
