"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { TenantMark } from "@/app/components/logo";
import type { Branding } from "@/lib/tenant/branding";
import { requestCall } from "@/app/discovery/actions";

const HOUSE_TENANT = { isHouse: true, name: "Prime PEO Brokers", branding: {} as Branding };

interface Props {
  tenant: { isHouse: boolean; name: string; branding: Branding } | null;
}

type Values = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  bestTime: string;
};

const EMPTY: Values = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
  bestTime: "",
};

export function TalkForm({ tenant }: Props) {
  const isPartner = tenant !== null && !tenant.isHouse;
  const brandName = isPartner
    ? (tenant.branding.companyName ?? tenant.name)
    : "Prime PEO Brokers";
  // Every host has a marketing page at "/" now, the partner's own in their
  // brand. This used to point partners at "/discovery" because "/" was their
  // sign-in portal. Same change as the discovery flow.
  const homeHref = "/";

  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<number | null>(null);

  function set<K extends keyof Values>(k: K, value: string) {
    setV((p) => ({ ...p, [k]: value }));
    setErrors((p) => (p[k] ? { ...p, [k]: "" } : p));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await requestCall(v);
      if (res.ok) {
        setDoneRef(res.ref);
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        setFormError(res.error);
      }
    } catch {
      setFormError("Sending failed. Nothing was lost. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-6 px-8 max-sm:px-[18px]">
          <Link href={homeHref} aria-label={`${brandName} home`} className="flex min-h-11 items-center">
            <TenantMark tenant={tenant ?? HOUSE_TENANT} size={30} />
          </Link>
          <Link
            href="/discovery"
            className="rounded-md border border-line-strong bg-transparent px-3.5 py-2 min-h-11 inline-flex items-center text-[13.5px] font-semibold transition-colors duration-150 hover:border-ink"
          >
            Start the six steps instead
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-8 pb-24 pt-11 max-sm:px-[18px]">
        {doneRef === null ? (
          <div className="mx-auto max-w-[720px]">
            <div className="rounded-md border border-line bg-raised p-10 pt-9 shadow-[0_1px_2px_rgba(25,35,59,.05)] max-sm:px-5 max-sm:py-[26px]">
              <div className="font-mono text-[11.5px] uppercase tracking-[.13em] text-accent">
                Talk first
              </div>
              <h1 className="mt-3 font-display text-[clamp(25px,3.4vw,32px)] font-semibold leading-[1.08] tracking-[-.022em]">
                Talk to a broker before you fill anything in.
              </h1>
              <p className="mt-3 max-w-[56ch] text-[15.5px] leading-normal text-ink-soft [text-wrap:pretty]">
                Leave a name, a work email, and what is on your mind. A licensed
                broker calls you back within one business day. Nothing here is
                shared with a provider.
              </p>

              <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-[30px]">
                <div className="grid grid-cols-2 items-end gap-x-5 gap-y-[30px] max-sm:grid-cols-1">
                  <Field
                    id="fullName"
                    label="Your name"
                    placeholder="Jane Doe"
                    value={v.fullName}
                    onChange={(x) => set("fullName", x)}
                    error={errors.fullName}
                    autoComplete="name"
                  />
                  <Field
                    id="email"
                    label="Work email"
                    help="Where the broker confirms the call."
                    placeholder="jane@acme.com"
                    type="email"
                    value={v.email}
                    onChange={(x) => set("email", x)}
                    error={errors.email}
                    autoComplete="email"
                  />
                </div>
                <div className="grid grid-cols-2 items-end gap-x-5 gap-y-[30px] max-sm:grid-cols-1">
                  <Field
                    id="phone"
                    label="Phone"
                    help="Optional. If you leave it out, they email to set a time."
                    placeholder="(555) 123-4567"
                    type="tel"
                    value={v.phone}
                    onChange={(x) => set("phone", x)}
                    error={errors.phone}
                    autoComplete="tel"
                  />
                  <Field
                    id="company"
                    label="Company"
                    placeholder="Acme Inc"
                    value={v.company}
                    onChange={(x) => set("company", x)}
                    error={errors.company}
                    autoComplete="organization"
                  />
                </div>

                <div>
                  <Label htmlFor="notes" className="block text-[14.5px] font-semibold text-ink">
                    What is on your mind?
                  </Label>
                  <div className="mt-[5px] text-[13.5px] leading-snug text-ink-muted">
                    Optional. A renewal date, a provider you are unhappy with, a
                    question you want answered before you commit any time.
                  </div>
                  <Textarea
                    id="notes"
                    rows={4}
                    value={v.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Our PEO renews in March and the admin fee went up 18%..."
                    className="mt-[11px] resize-y rounded-md px-[15px] py-3.5 text-base leading-normal md:text-base"
                  />
                </div>

                <Field
                  id="bestTime"
                  label="Best time to reach you"
                  placeholder="Weekday mornings ET"
                  value={v.bestTime}
                  onChange={(x) => set("bestTime", x)}
                  error={errors.bestTime}
                />

                {formError && (
                  <div aria-live="polite" className="text-[13.5px] text-danger">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 border-t border-sunken pt-[26px] max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:w-full max-sm:[&>*]:text-center">
                  <Link
                    href={homeHref}
                    className="h-12 inline-flex items-center justify-center cursor-pointer rounded-md border border-line-strong bg-transparent px-5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
                  >
                    Back
                  </Link>
                  <button
                    type="submit"
                    disabled={busy}
                    className="cursor-pointer rounded-md border border-accent bg-accent px-6 py-3.5 text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px disabled:cursor-wait disabled:opacity-70"
                  >
                    {busy ? "Sending…" : "Ask for a call"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div
            className="mx-auto mt-6 max-w-[720px]"
            style={{ animation: "pv-panel-in 250ms var(--pv-ease) both" }}
          >
            <div className="flex items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[.13em] text-positive-deep">
              <span className="h-[7px] w-[7px] rounded-full bg-positive" />
              Received · ref {doneRef}
            </div>
            <h1 className="mt-4 font-display text-[clamp(28px,4vw,38px)] font-semibold leading-[1.05] tracking-[-.028em] [text-wrap:balance]">
              A broker will call you.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[17px] leading-normal text-ink-soft">
              Within one business day, from {brandName}. If you gave a phone
              number they call it; otherwise they email to set a time.
            </p>
            <p className="mt-4 max-w-[54ch] text-[15.5px] leading-normal text-ink-muted">
              Want the call to be more useful? Start the six steps now. Anything
              you answer is in front of the broker before they dial.
            </p>
            <div className="mt-7 flex flex-wrap gap-3.5">
              <Link
                href="/discovery"
                className="rounded-md bg-accent px-[22px] py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
              >
                Start the six steps
              </Link>
              {/* Shown on partner hosts too now that they have a homepage of
                  their own to go back to. */}
              <Link
                href={homeHref}
                className="rounded-md border border-line-strong px-[22px] py-3.5 text-[15.5px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
              >
                Back to the homepage
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  placeholder,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  help?: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="block text-[14.5px] font-semibold text-ink">
        {label}
      </Label>
      {help && (
        <div className="mt-[5px] text-[13.5px] leading-snug text-ink-muted">{help}</div>
      )}
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "mt-[11px] h-auto min-h-11 rounded-md px-[15px] py-3.5 text-base md:text-base",
        )}
      />
      {error && (
        <div id={`${id}-error`} aria-live="polite" className="mt-[9px] text-[13.5px] leading-snug text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
