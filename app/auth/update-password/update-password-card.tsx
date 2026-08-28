"use client";

import { useState, useTransition } from "react";
import { updatePassword } from "@/app/login/actions";

export function UpdatePasswordCard({
  flow,
  email,
}: {
  flow: "invite" | "recovery";
  email: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  const n = password.length;
  const lvl = n === 0 ? 0 : n < 8 ? 1 : n < 12 ? 2 : n < 18 ? 3 : 4;
  const lvlColor = ["#EAE6E1", "#8C2F2A", "#A8710E", "#4A6B3A", "#4A6B3A"][lvl];
  const lvlLabel = [
    "Nothing yet",
    "Too short",
    "Weak — add length",
    "Good",
    "Strong",
  ][lvl];
  const lvlFg =
    lvl >= 3 ? "#3C5730" : lvl === 0 ? "#6E6A64" : lvl === 1 ? "#8C2F2A" : "#8A5C0B";

  function submit() {
    if (busy) return;
    setError("");
    startTransition(async () => {
      const res = await updatePassword({ password });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <div className="pv-label">
        {flow === "invite" ? "Invitation · Prime PEO Brokers" : "Password reset"}
      </div>
      <h1 className="mt-3 font-display text-[29px] font-semibold leading-[1.08] tracking-[-.022em]">
        Set your password
      </h1>
      <p className="mt-3 text-[15px] leading-normal text-ink-soft">
        {flow === "invite"
          ? `You are setting the password for ${email}. This link is single-use.`
          : `New password for ${email}. The reset link is single-use.`}
      </p>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-[22px] flex items-start gap-[11px] rounded-[4px] border border-[rgba(140,47,42,.35)] bg-[rgba(140,47,42,.06)] px-[15px] py-[13px]"
        >
          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-danger" />
          <span className="text-sm leading-normal text-[#7A2823]">{error}</span>
        </div>
      )}

      <div className="mt-[26px] flex flex-col gap-5">
        <div>
          <label htmlFor="auth-new" className="text-sm font-semibold">
            New password
          </label>
          <input
            id="auth-new"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="mt-[9px] w-full rounded-[4px] border border-line-strong bg-raised px-[15px] py-3.5 text-base transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in oklab,var(--pv-accent) 12%,transparent)] focus:outline-none"
          />
        </div>

        <div>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-[2px] transition-colors duration-150"
                style={{ background: i < lvl ? lvlColor : "#EAE6E1" }}
              />
            ))}
          </div>
          <div
            aria-live="polite"
            className="mt-2 font-mono text-[11.5px] uppercase tracking-[.06em]"
            style={{ color: lvlFg }}
          >
            {lvlLabel}
          </div>
          <div className="mt-1.5 text-[13px] leading-snug text-ink-muted">
            12 characters minimum. A passphrase beats a password.
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-[26px] w-full rounded-[4px] border border-accent bg-accent p-[15px] text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px disabled:cursor-wait disabled:bg-[#4A5A8C]"
      >
        {busy ? "Working…" : "Set password and sign in"}
      </button>

      <div className="mt-[22px] border-t border-sunken pt-5 text-[13.5px] leading-normal text-ink-muted">
        Every record you open in the console is written to the record history
        with your name.
      </div>
    </>
  );
}
