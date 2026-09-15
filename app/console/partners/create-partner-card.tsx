"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Card, CardContent } from "@/app/components/ui/card";
import { createPartner } from "./actions";

/**
 * Add a partner.
 *
 * Same shape as the team cards: local state per field, useTransition for
 * pending, a plain object into a typed action, a discriminated result rendered
 * inline. No form element, no FormData.
 *
 * The slug is derived from the name as you type but stays editable, because it
 * becomes a permanent subdomain: "Acme Brokers & Co" should suggest
 * "acme-brokers-co" rather than making someone work out the rules, but the
 * client may want "acme".
 */
export function CreatePartnerCard({ apexHost }: { apexHost: string }) {
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

  const submit = () => {
    if (pending || !name.trim() || !slug.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await createPartner({ slug, name, contactEmail, inviteEmail });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setName("");
      setSlug("");
      setContactEmail("");
      setInviteEmail("");
      setSlugEdited(false);
      toast.success(result.message ?? "Partner created.");
    });
  };

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Add a partner
        </div>

        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label htmlFor="partner-name" className="text-[13px] text-ink-soft">
              Company name
            </label>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Acme Brokers"
              disabled={pending}
              className="mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="partner-slug" className="text-[13px] text-ink-soft">
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
              <label htmlFor="partner-contact" className="text-[13px] text-ink-soft">
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
              <label htmlFor="partner-invite" className="text-[13px] text-ink-soft">
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

          <div className="flex items-center gap-3">
            <Button
              onClick={submit}
              disabled={pending || !name.trim() || !slug.trim()}
              className="cursor-pointer"
            >
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              Create partner
            </Button>
            <span className="text-[12.5px] text-ink-muted">
              Their pipeline is set up automatically. Add a logo and colours
              from the row below once created.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
