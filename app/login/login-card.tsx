"use client";

import { useState, useTransition } from "react";
import { signIn, sendResetLink } from "./actions";

const COPY = {
  signin: {
    eyebrow: "Broker console",
    heading: "Sign in",
    sub: "For Prime PEO Brokers staff and partner accounts.",
    cta: "Sign in",
    foot: "Access is by invitation. Ask an admin on your team if you need one.",
  },
  forgot: {
    eyebrow: "Password reset",
    heading: "Send a reset link",
    sub: "We email a single-use link that expires in one hour.",
    cta: "Send reset link",
    foot: "The link only works on the address already on the account. We will not change it for you over email.",
  },
};

export function LoginCard({
  next,
  linkError,
}: {
  next: string;
  linkError: boolean;
}) {
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    linkError ? "That link has expired or was already used. Ask for a fresh one." : "",
  );
  const [sent, setSent] = useState(false);
  const [busy, startTransition] = useTransition();

  const copy = COPY[view];

  function submit() {
    if (busy) return;
    setError("");
    startTransition(async () => {
      if (view === "signin") {
        const res = await signIn({ email, password, next });
        if (res?.error) setError(res.error);
        // on success the action redirects
      } else {
        const res = await sendResetLink({ email });
        if ("error" in res) setError(res.error);
        else setSent(true);
      }
    });
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div className="pv-label">{copy.eyebrow}</div>
      <h1 className="mt-3 font-display text-[29px] font-semibold leading-[1.08] tracking-[-.022em] [text-wrap:balance]">
        {copy.heading}
      </h1>
      <p className="mt-3 text-[15px] leading-normal text-ink-soft">{copy.sub}</p>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-[22px] flex items-start gap-[11px] rounded-[4px] border border-[rgba(140,47,42,.35)] bg-[rgba(140,47,42,.06)] px-[15px] py-[13px]"
        >
          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-danger" />
          <span className="text-sm leading-normal text-[var(--pv-danger)]">{error}</span>
        </div>
      )}

      {sent && view === "forgot" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-[22px] rounded-[4px] border border-[rgba(74,107,58,.35)] bg-[rgba(74,107,58,.07)] px-4 py-3.5"
        >
          <div className="text-[14.5px] font-semibold text-[var(--pv-positive-deep)]">
            Reset link sent
          </div>
          <div className="mt-[5px] text-sm leading-normal text-ink-soft">
            If that address is on an account, a link reaches it within a minute
            and expires in one hour. Check spam before asking for another.
          </div>
        </div>
      )}

      <div className="mt-[26px] flex flex-col gap-5">
        <div>
          <label htmlFor="auth-email" className="text-sm font-semibold">
            Work email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
            placeholder="you@primepeobrokers.com"
            className="mt-[9px] w-full rounded-[4px] border border-line-strong bg-raised px-[15px] py-3.5 text-base transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_rgba(31,61,140,.12)] focus:outline-none"
          />
          {view === "forgot" && (
            <div className="mt-[7px] text-[13px] leading-snug text-ink-muted">
              The address you were invited on.
            </div>
          )}
        </div>

        {view === "signin" && (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="auth-pw" className="text-sm font-semibold">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setView("forgot");
                  setError("");
                  setSent(false);
                }}
                className="-my-2 cursor-pointer py-2 text-[13px] text-accent hover:text-accent-press"
              >
                Forgot password
              </button>
            </div>
            <input
              id="auth-pw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKey}
              className="mt-[9px] w-full rounded-[4px] border border-line-strong bg-raised px-[15px] py-3.5 text-base transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_rgba(31,61,140,.12)] focus:outline-none"
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-[26px] w-full rounded-[4px] border border-accent bg-accent p-[15px] text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px disabled:cursor-wait disabled:bg-[var(--pv-ink-disabled)]"
      >
        {busy ? "Working…" : copy.cta}
      </button>

      <div className="mt-[22px] border-t border-sunken pt-5 text-[13.5px] leading-normal text-ink-muted">
        {copy.foot}
        {view === "forgot" && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setView("signin");
                setError("");
                setSent(false);
              }}
              className="cursor-pointer text-accent underline hover:text-accent-press"
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </>
  );
}
