"use client";

import { useEffect, useState, useTransition } from "react";
import { signIn, sendResetCode, verifyResetCode } from "./actions";

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
    heading: "Email me a code",
    sub: "We send an 8-digit code that expires in 15 minutes.",
    cta: "Send the code",
    foot: "The code only goes to the address already on the account. We will not change it for you over email.",
  },
  code: {
    eyebrow: "Password reset",
    heading: "Enter your code",
    sub: "Check your inbox. The code is 8 digits and expires in 15 minutes.",
    cta: "Verify and continue",
    foot: "Asking for a new code cancels the previous one.",
  },
};

export function LoginCard({
  next,
  linkError,
  revoked = false,
  partnerName = null,
}: {
  next: string;
  linkError: boolean;
  /** Their token is valid but the account is not on a team any more. */
  revoked?: boolean;
  /**
   * The partner whose subdomain this is, or null on the house site. Names the
   * card so a partner's user is not told they are signing in to the house
   * product on their own domain.
   */
  partnerName?: string | null;
}) {
  const [view, setView] = useState<"signin" | "forgot" | "code">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /*
    "revoked" outranks "link": someone removed from the team clicking a fresh
    invite hits both, and telling them the link expired would send them
    chasing another one that fails exactly the same way.
  */
  const [error, setError] = useState(
    revoked
      ? "This account no longer has access. Ask an admin on the team to restore it."
      : linkError
        ? "That link has expired or was already used. Ask for a fresh one."
        : "",
  );
  const [code, setCode] = useState("");
  // Mirrors the server's 60s minimum gap, so the button cannot invite a
  // request that is going to be refused.
  const [cooldown, setCooldown] = useState(0);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /*
    On a partner subdomain the sign-in card names the partner, not the house
    product: "Broker console" and "For Prime PEO Brokers staff" are both wrong
    there and were the last white-label leak on this screen. Only the signin
    view says either; the reset views are already brand-neutral.
  */
  const copy =
    partnerName && view === "signin"
      ? {
          ...COPY.signin,
          eyebrow: "Partner portal",
          sub: `For ${partnerName} accounts.`,
        }
      : COPY[view];

  function submit() {
    if (busy) return;
    setError("");
    startTransition(async () => {
      if (view === "signin") {
        const res = await signIn({ email, password, next });
        if (res?.error) setError(res.error);
        // on success the action redirects
      } else if (view === "forgot") {
        const res = await sendResetCode({ email });
        if ("error" in res) setError(res.error);
        else {
          setView("code");
          setCooldown(60);
        }
      } else {
        const res = await verifyResetCode({ email, code });
        // Only failures return; success redirects to set a new password.
        if (res?.error) setError(res.error);
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
          className="mt-[22px] flex items-start gap-[11px] rounded-md border border-[rgba(140,47,42,.35)] bg-[rgba(140,47,42,.06)] px-[15px] py-[13px]"
        >
          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-danger" />
          <span className="text-sm leading-normal text-[var(--pv-danger)]">{error}</span>
        </div>
      )}

      {view === "code" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-[22px] rounded-md border border-[rgba(74,107,58,.35)] bg-[rgba(74,107,58,.07)] px-4 py-3.5"
        >
          <div className="text-[14.5px] font-semibold text-[var(--pv-positive-deep)]">
            Code sent
          </div>
          <div className="mt-[5px] text-sm leading-normal text-ink-soft">
            If {email || "that address"} is on an account, an 8-digit code
            reaches it within a minute. Check spam before asking for another.
          </div>
        </div>
      )}

      <div className="mt-[26px] flex flex-col gap-5">
        <div>
          <label htmlFor="auth-email" className="block text-sm font-semibold">
            Work email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
            readOnly={view === "code"}
            placeholder="you@primepeobrokers.com"
            className="mt-[9px] w-full rounded-md border border-line-strong bg-raised px-[15px] py-3.5 text-base transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in oklab,var(--pv-accent) 12%,transparent)] focus:outline-none"
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
                  setCode("");
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
              className="mt-[9px] w-full rounded-md border border-line-strong bg-raised px-[15px] py-3.5 text-base transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in oklab,var(--pv-accent) 12%,transparent)] focus:outline-none"
            />
          </div>
        )}

        {view === "code" && (
          <div>
            <label htmlFor="auth-code" className="block text-sm font-semibold">
              8-digit code
            </label>
            <input
              id="auth-code"
              // one-time-code lets iOS and Android offer the code straight from
              // the notification, which is most of the value of this flow.
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={onKey}
              placeholder="00000000"
              className="mt-[9px] w-full rounded-md border border-line-strong bg-raised px-[15px] py-3.5 text-center font-mono text-[22px] tracking-[.32em] transition-all duration-150 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => {
                setError("");
                setCode("");
                startTransition(async () => {
                  const res = await sendResetCode({ email });
                  if ("error" in res) setError(res.error);
                  else setCooldown(60);
                });
              }}
              className="mt-[11px] cursor-pointer text-[13px] text-accent hover:text-accent-press disabled:cursor-default disabled:text-ink-faint"
            >
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-[26px] w-full rounded-md border border-accent bg-accent p-[15px] text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px disabled:cursor-wait disabled:bg-[var(--pv-ink-disabled)]"
      >
        {busy ? "Working…" : copy.cta}
      </button>

      <div className="mt-[22px] border-t border-sunken pt-5 text-[13.5px] leading-normal text-ink-muted">
        {copy.foot}
        {view !== "signin" && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setView("signin");
                setError("");
                setCode("");
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
