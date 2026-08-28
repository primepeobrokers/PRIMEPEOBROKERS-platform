"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  STEPS,
  TOTAL_STEPS,
  formatAnswer,
  stepSummary,
  validateField,
  validateStep,
  visibleFields,
  type Answers,
  type Category,
  type FieldDef,
} from "@/lib/discovery/schema";
import { cn } from "@/lib/utils";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Checkbox } from "@/app/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Logo } from "@/app/components/logo";
import {
  saveDraft,
  submitRecord,
  requestResumeLink,
  type DraftHandle,
} from "./actions";

const STORAGE_KEY = "pv-discovery-draft";

interface Props {
  resumed: {
    handle: DraftHandle;
    answers: Answers;
    stepsCompleted: number;
  } | null;
  /** 'shop' (default) or 'renewal', from the home page entry point. */
  intent?: string;
  /** Category named in the URL, so a deep link can skip the picker. */
  presetCategory?: Category;
}

interface Toast {
  title: string;
  body: string;
}

export function DiscoveryFlow({ resumed, intent, presetCategory }: Props) {
  // A draft resumed from an emailed link is available at first render.
  // A category in the URL skips the picker; a renewal entry preselects the
  // driver that sent them here.
  const seeded: Answers = {};
  if (presetCategory) seeded.category = presetCategory;
  if (intent === "renewal") seeded.drivers = ["Cost"];

  const resumedStep = resumed
    ? Math.min(resumed.stepsCompleted, TOTAL_STEPS - 1)
    : presetCategory
      ? 1
      : 0;
  const [view, setView] = useState<"flow" | "review" | "done">("flow");
  const [step, setStep] = useState(resumedStep);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [visited, setVisited] = useState<number[]>(
    Array.from({ length: resumedStep + 1 }, (_, i) => i),
  );
  const [answers, setAnswers] = useState<Answers>(
    resumed?.answers ?? seeded,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [abandon, setAbandon] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<number | null>(null);
  const [doneAt, setDoneAt] = useState("");
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const handleRef = useRef<DraftHandle | null>(resumed?.handle ?? null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitShown = useRef(false);
  const savingChain = useRef<Promise<void>>(Promise.resolve());

  // ---- hydration: an emailed resume link is applied at first render above;
  // otherwise restore any same-browser draft from localStorage. This must run
  // in an effect (storage is client-only), hence the rule exception.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (resumed) {
      persistLocal(resumed.handle, resumed.answers, resumedStep);
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          handle: DraftHandle | null;
          answers: Answers;
          step: number;
          visited: number[];
        };
        if (saved && typeof saved.step === "number" && saved.answers) {
          handleRef.current = saved.handle ?? null;
          setAnswers(saved.answers);
          setStep(Math.min(Math.max(saved.step, 0), TOTAL_STEPS - 1));
          setVisited(
            Array.isArray(saved.visited) && saved.visited.length
              ? saved.visited
              : [0],
          );
        }
      }
    } catch {
      /* corrupted local state: start fresh */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function persistLocal(
    handle: DraftHandle | null,
    a: Answers,
    s: number,
  ) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ handle, answers: a, step: s, visited }),
      );
    } catch {
      /* private mode: in-tab state still works */
    }
  }

  useEffect(() => {
    if (!hydrated || view === "done") return;
    persistLocal(handleRef.current, answers, step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, step, visited, hydrated, view]);

  // ---- exit intent: offer the resume link once ----
  useEffect(() => {
    const onMouseOut = (e: MouseEvent) => {
      if (
        e.clientY <= 4 &&
        !exitShown.current &&
        view === "flow" &&
        step > 0
      ) {
        exitShown.current = true;
        setAbandon(true);
      }
    };
    document.addEventListener("mouseout", onMouseOut);
    return () => document.removeEventListener("mouseout", onMouseOut);
  }, [view, step]);

  function fireToast(title: string, body: string) {
    setToast({ title, body });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }

  const markSaved = useCallback(() => {
    const d = new Date();
    setSavedLabel(
      "SAVED " +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0"),
    );
  }, []);

  /**
   * Persists the draft to the server. Saves are serialised rather than
   * dropped: a click that lands mid-flight (picking an option, then hitting
   * Continue) queues behind the in-flight request instead of returning early,
   * so the visitor always sees the SAVED confirmation for their latest answers.
   */
  const syncDraft = useCallback(
    async (a: Answers, stepsCompleted: number) => {
      const run = async () => {
        try {
          const res = await saveDraft({
            handle: handleRef.current,
            answers: a,
            stepsCompleted,
            intent,
          });
          if (res.ok) {
            handleRef.current = res.handle;
            markSaved();
          }
        } catch {
          /* offline: localStorage still holds the answers */
        }
      };
      // Chain onto whatever is in flight so the draft row is never written
      // concurrently (which would race on creating the initial row).
      savingChain.current = savingChain.current.then(run, run);
      return savingChain.current;
    },
    [markSaved, intent],
  );

  function set(id: string, value: Answers[string]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
  }

  function goTo(i: number) {
    setDir(i < step ? "back" : "fwd");
    setStep(i);
    setView("flow");
  }

  function goNext() {
    const stepErrors = validateStep(step, answers);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      return;
    }
    void syncDraft(answers, step + 1);
    if (step === TOTAL_STEPS - 1) {
      setDir("fwd");
      setView("review");
      return;
    }
    const n = step + 1;
    setDir("fwd");
    setStep(n);
    setVisited((v) => (v.includes(n) ? v : [...v, n]));
    fireToast(
      `Step ${step + 1} saved`,
      `${TOTAL_STEPS} of ${TOTAL_STEPS} when you are done. Leave any time and resume from the emailed link.`,
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      // Let any in-flight draft save finish first, so handleRef points at the
      // existing row rather than submitting a second one.
      await savingChain.current;
      const res = await submitRecord({
        handle: handleRef.current,
        answers,
      });
      if (res.ok) {
        const d = new Date();
        setDoneRef(res.ref);
        setDoneAt(
          String(d.getUTCHours()).padStart(2, "0") +
            ":" +
            String(d.getUTCMinutes()).padStart(2, "0") +
            " UTC",
        );
        setView("done");
        setAbandon(false);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } else {
        if (res.fieldErrors) setErrors((p) => ({ ...p, ...res.fieldErrors }));
        fireToast("Not submitted", res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    setResumeError("");
    const res = await requestResumeLink({
      handle: handleRef.current,
      answers,
      stepsCompleted: step + 1,
      email: resumeEmail,
    });
    if (res.ok) {
      setAbandon(false);
      markSaved();
      fireToast(
        "Link sent",
        `Check your inbox. It returns you to step ${step + 1} and expires in 30 days.`,
      );
    } else {
      setResumeError(res.error);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      goNext();
    }
  };

  const stepDef = STEPS[step];

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-6 px-8 max-sm:px-[18px]">
          <Link href="/" aria-label="Prime PEO Brokers home" className="flex items-center">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-5">
            <div
              aria-live="polite"
              className="whitespace-nowrap font-mono text-[11.5px] uppercase tracking-[.06em] text-positive-deep"
            >
              {savedLabel}
            </div>
            {view !== "done" && (
              <button
                type="button"
                onClick={() => setAbandon(true)}
                className="cursor-pointer rounded-[4px] border border-line-strong bg-transparent px-3.5 py-2 text-[13.5px] font-semibold transition-colors duration-150 hover:border-ink"
              >
                Finish later
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-8 pb-24 pt-11 max-sm:px-[18px]">
        {view === "flow" && (
          <div className="grid grid-cols-[312px_1fr] items-start gap-14 max-lg:grid-cols-1 max-lg:gap-7">
            {/* the record, doubling as progress */}
            <aside className="sticky top-[108px] max-lg:hidden">
              <div className="pv-label">Your record</div>
              <div className="mt-3.5 overflow-hidden rounded-[4px] border border-line bg-raised">
                {STEPS.map((s, i) => {
                  const done = visited.includes(i) && i < step;
                  const cur = i === step;
                  const reachable = visited.includes(i);
                  return (
                    <button
                      key={s.title}
                      type="button"
                      disabled={!reachable}
                      aria-current={cur ? "step" : undefined}
                      onClick={() => reachable && goTo(i)}
                      className="grid w-full grid-cols-[22px_1fr] items-start gap-3 border-b border-sunken px-4 py-[13px] text-left transition-colors duration-150"
                      style={{
                        background: cur ? "color-mix(in oklab,var(--pv-accent) 5%,transparent)" : "#FFF",
                        borderLeft: `2px solid ${cur ? "var(--pv-accent)" : done ? "var(--pv-positive)" : "var(--pv-surface-sunken)"}`,
                        cursor: reachable ? "pointer" : "default",
                      }}
                    >
                      <span
                        className="pt-0.5 font-mono text-xs"
                        style={{
                          color: done ? "var(--pv-positive)" : cur ? "var(--pv-accent)" : "var(--pv-ink-disabled)",
                        }}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="block">
                        <span
                          className="block text-sm"
                          style={{
                            fontWeight: cur ? 600 : 500,
                            color: reachable ? "var(--pv-ink)" : "var(--pv-ink-faint)",
                          }}
                        >
                          {s.title}
                        </span>
                        <span className="mt-1 block font-mono text-xs text-ink-muted">
                          {done
                            ? stepSummary(i, answers)
                            : cur
                              ? "In progress"
                              : "Not started"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3.5 text-[13px] leading-normal text-ink-muted">
                Answered steps are saved. You can come back to any of them.
              </div>
            </aside>

            <section>
              {/* mobile progress */}
              <div className="mb-[22px] hidden max-lg:block">
                <div className="flex items-baseline justify-between font-mono text-[11.5px] uppercase tracking-[.1em] text-ink-muted">
                  <span>
                    Step {step + 1} of {TOTAL_STEPS}
                  </span>
                  <span>{Math.round(((step + 1) / TOTAL_STEPS) * 100)}% complete</span>
                </div>
                <div className="mt-2.5 flex gap-1">
                  {STEPS.map((s, i) => (
                    <div
                      key={s.title}
                      className="h-1 flex-1 rounded-[2px] transition-colors duration-250"
                      style={{
                        background:
                          i === step
                            ? "var(--pv-accent)"
                            : visited.includes(i) && i < step
                              ? "var(--pv-positive)"
                              : "var(--pv-surface-sunken)",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div
                key={`${step}-${dir}`}
                className="rounded-[4px] border border-line bg-raised p-10 pt-9 shadow-[0_1px_2px_rgba(25,35,59,.05)] max-sm:px-5 max-sm:py-[26px]"
                style={{
                  animation: `${dir === "fwd" ? "pv-fwd" : "pv-back"} 250ms var(--pv-ease) both`,
                }}
              >
                <div className="font-mono text-[11.5px] uppercase tracking-[.13em] text-accent">
                  Step {step + 1} / {TOTAL_STEPS}
                </div>
                <h1 className="mt-3 font-display text-[clamp(25px,3.4vw,32px)] font-semibold leading-[1.08] tracking-[-.022em]">
                  {stepDef.title}
                </h1>
                <p className="mt-3 max-w-[56ch] text-[15.5px] leading-normal text-ink-soft [text-wrap:pretty]">
                  {stepDef.intro}
                </p>

                {stepDef.sensitive && (
                  <div className="mt-[22px] flex items-start gap-[11px] rounded-[4px] border border-ink bg-tint px-[15px] py-[13px]">
                    <span className="whitespace-nowrap rounded-[2px] border border-ink px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[.1em]">
                      Sensitive
                    </span>
                    <span className="text-[13.5px] leading-normal text-ink-soft">
                      Stored with encryption at rest and never exposed through a
                      public endpoint. Visible to your broker&apos;s team only,
                      never to a provider without your approval.
                    </span>
                  </div>
                )}

                <div className="mt-8 flex flex-col gap-[30px]">
                  {visibleFields(step, answers).map((f) => (
                    <Field
                      key={f.id}
                      field={f}
                      answers={answers}
                      error={errors[f.id] ?? ""}
                      onKey={onKey}
                      set={set}
                      onBlurValidate={() => {
                        const e = validateField(f, answers);
                        setErrors((prev) => ({ ...prev, [f.id]: e }));
                      }}
                    />
                  ))}
                </div>

                <div className="mt-[38px] flex items-center justify-between gap-4 border-t border-sunken pt-[26px] max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:w-full max-sm:[&>*]:text-center">
                  <button
                    type="button"
                    onClick={() =>
                      step === 0 ? setAbandon(true) : goTo(step - 1)
                    }
                    className="cursor-pointer rounded-[4px] border border-line-strong bg-transparent px-5 py-[13px] text-[15px] font-semibold transition-colors duration-150 hover:border-ink"
                    style={{ color: step === 0 ? "var(--pv-ink-muted)" : "var(--pv-ink)" }}
                  >
                    {step === 0 ? "Leave the flow" : "Back"}
                  </button>
                  <div className="flex items-center gap-4 max-sm:flex-col">
                    <span className="font-mono text-[11.5px] tracking-[.05em] text-ink-muted max-sm:hidden">
                      ↵ ENTER
                    </span>
                    <button
                      type="button"
                      onClick={goNext}
                      className="cursor-pointer rounded-[4px] border border-accent bg-accent px-6 py-3.5 text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px max-sm:w-full"
                    >
                      {step === TOTAL_STEPS - 1 ? "Review your record" : "Continue"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {view === "review" && (
          <div
            className="mx-auto max-w-[820px]"
            style={{ animation: "pv-panel-in 250ms var(--pv-ease) both" }}
          >
            <div className="font-mono text-[11.5px] uppercase tracking-[.13em] text-accent">
              Review
            </div>
            <h1 className="mt-3 font-display text-[clamp(26px,3.6vw,34px)] font-semibold leading-[1.06] tracking-[-.025em]">
              Check the record before it goes to a broker.
            </h1>
            <p className="mt-3.5 max-w-[58ch] text-base leading-normal text-ink-soft">
              Nothing here is shared with a provider until you approve the
              shortlist. Edit any answer and you return to this page.
            </p>
            <div className="mt-[30px] overflow-hidden rounded-[4px] border border-line bg-raised">
              {STEPS.map((s, i) => (
                <div key={s.title} className="border-b border-line last:border-b-0">
                  <div
                    className="flex items-baseline justify-between gap-5 border-b border-sunken px-[22px] py-3.5"
                    style={{ background: s.sensitive ? "var(--pv-surface-tint)" : "var(--pv-surface-sunken)" }}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[11.5px] text-ink-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-[16.5px] font-semibold">
                        {s.title}
                      </span>
                      {s.sensitive && (
                        <span className="rounded-[2px] border border-ink px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[.1em]">
                          Sensitive
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      className="cursor-pointer border-b border-accent/35 pb-0.5 text-sm font-semibold text-accent transition-colors duration-150 hover:border-accent"
                    >
                      Edit
                    </button>
                  </div>
                  {visibleFields(i, answers).map((f) => (
                    <div
                      key={f.id}
                      className="grid grid-cols-[240px_1fr] items-baseline gap-6 border-b border-surface px-[22px] py-[13px] max-sm:grid-cols-1 max-sm:gap-1.5"
                    >
                      <div className="text-[14.5px] text-ink-muted">{f.label}</div>
                      <div className="font-mono text-[14.5px]">
                        {formatAnswer(f.id, answers)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-7 flex items-center justify-between gap-4 max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:text-center">
              <button
                type="button"
                onClick={() => goTo(TOTAL_STEPS - 1)}
                className="cursor-pointer rounded-[4px] border border-line-strong bg-transparent px-5 py-[13px] text-[15px] font-semibold"
              >
                Back to step 6
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="cursor-pointer rounded-[4px] border border-accent bg-accent px-[26px] py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "Submitting…" : "Submit the record"}
              </button>
            </div>
          </div>
        )}

        {view === "done" && (
          <div
            className="mx-auto mt-6 max-w-[720px]"
            style={{ animation: "pv-panel-in 250ms var(--pv-ease) both" }}
          >
            <div className="flex items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[.13em] text-positive-deep">
              <span className="h-[7px] w-[7px] rounded-full bg-positive" />
              Submitted · ref {doneRef} · {doneAt}
            </div>
            <h1 className="mt-4 font-display text-[clamp(28px,4vw,38px)] font-semibold leading-[1.05] tracking-[-.028em] [text-wrap:balance]">
              Your record is with the brokerage team.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[17px] leading-normal text-ink-soft">
              A licensed broker in your state has your record in front of
              them. Here is the sequence from here.
            </p>
            <div className="mt-[30px] rounded-[4px] border border-line bg-raised">
              {[
                {
                  when: "Within 1 day",
                  what: "A broker reads the record",
                  detail:
                    "If anything is ambiguous (classification, the renewal date, the bundled fee) they ask you before quoting.",
                },
                {
                  when: "Days 1–2",
                  what: "You approve the shortlist",
                  detail:
                    "They name the providers they intend to quote. Nothing leaves Prime PEO Brokers until you confirm that list.",
                },
                {
                  when: "Days 3–5",
                  what: "Written comparison",
                  detail:
                    "Every model on one axis, per employee per month, with the assumptions stated in plain text.",
                },
                {
                  when: "Any time",
                  what: "You can stop",
                  detail:
                    "Ask for deletion and the record and drafts are removed within 30 days.",
                },
              ].map((n) => (
                <div
                  key={n.what}
                  className="grid grid-cols-[132px_1fr] items-start gap-[22px] border-b border-sunken px-[22px] py-[18px] last:border-b-0 max-sm:grid-cols-1 max-sm:gap-1.5"
                >
                  <div className="font-mono text-[12.5px] tracking-[.04em] text-accent">
                    {n.when}
                  </div>
                  <div>
                    <div className="text-[15.5px] font-semibold">{n.what}</div>
                    <div className="mt-[5px] text-sm leading-normal text-ink-muted">
                      {n.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3.5">
              <Link
                href="/"
                className="rounded-[4px] bg-accent px-[22px] py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
              >
                Back to the homepage
              </Link>
            </div>
            <p className="mt-6 text-sm leading-normal text-ink-muted">
              Something wrong in the record? Reply to the confirmation email and
              it is corrected before quoting starts.
            </p>
          </div>
        )}
      </main>

      {/* save-and-finish-later bar */}
      {abandon && view !== "done" && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-raised shadow-[0_-8px_28px_-18px_rgba(25,35,59,.3)]"
          style={{ animation: "pv-toast-in 250ms var(--pv-ease) both" }}
        >
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-5 px-8 pb-[22px] pt-5 max-sm:px-[18px]">
            <div>
              <div className="text-[15.5px] font-semibold">
                Keep what you have answered.
              </div>
              <div className="mt-1 text-sm leading-normal text-ink-muted">
                You are {step + 1} of {TOTAL_STEPS} steps in. We will email a link that returns
                you to this step. No other mail.
              </div>
              {resumeError && (
                <div className="mt-1.5 text-[13.5px] text-danger">{resumeError}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="pv-resume" className="sr-only">
                Email for your resume link
              </label>
              <input
                id="pv-resume"
                type="email"
                value={resumeEmail}
                onChange={(e) => setResumeEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-[236px] rounded-[4px] border border-line-strong bg-raised px-3.5 py-3 text-[15px] focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in oklab,var(--pv-accent) 12%,transparent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={sendLink}
                className="cursor-pointer rounded-[4px] border border-accent bg-accent px-[18px] py-3 text-[15px] font-semibold text-white"
              >
                Send the link
              </button>
              <button
                type="button"
                onClick={() => setAbandon(false)}
                className="cursor-pointer px-2 py-3 text-sm text-ink-muted underline"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-7 left-7 z-60 flex max-w-[380px] items-start gap-3 rounded-[4px] bg-dark px-[19px] py-[15px] text-dark-ink shadow-[0_12px_28px_-12px_rgba(25,35,59,.5)]"
          style={{ animation: "pv-toast-in 250ms var(--pv-ease) both" }}
        >
          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-positive-bright" />
          <div>
            <div className="text-[14.5px] font-semibold">{toast.title}</div>
            <div className="mt-[3px] text-[13.5px] leading-snug text-dark-ink-muted">
              {toast.body}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- field renderer ---------- */

function Field({
  field: f,
  answers,
  error,
  set,
  onKey,
  onBlurValidate,
}: {
  field: FieldDef;
  answers: Answers;
  error: string;
  set: (id: string, value: Answers[string]) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onBlurValidate: () => void;
}) {
  const val = answers[f.id];
  const mono = f.type === "num" || f.mono;
  const arr = Array.isArray(val) ? val : val ? [String(val)] : [];

  // The category picker is the whole of step 1 and carries its own heading.
  if (f.type === "cards") {
    return (
      <div>
        <div className="pv-label">{f.label}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          {CATEGORIES.map((c) => {
            const on = val === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set(f.id, c.id)}
                className={cn(
                  "group flex cursor-pointer items-start gap-3.5 rounded-[4px] border bg-raised px-[18px] py-4 text-left transition-all duration-150",
                  on
                    ? "border-accent shadow-[0_0_0_1px_var(--pv-accent)]"
                    : "border-line hover:border-line-strong",
                )}
              >
                <span aria-hidden className="text-[22px] leading-none">
                  {c.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-semibold">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-ink-muted">
                    {c.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {error && (
          <div aria-live="polite" className="mt-[9px] text-[13.5px] text-danger">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <Label
        htmlFor={f.id}
        className="block text-[14.5px] font-semibold text-ink"
      >
        {f.label}
      </Label>
      {f.help && (
        <div className="mt-[5px] text-[13.5px] leading-snug text-ink-muted">
          {f.help}
        </div>
      )}

      {(f.type === "text" || f.type === "num") && (
        <Input
          id={f.id}
          type="text"
          inputMode={f.type === "num" ? "numeric" : undefined}
          value={typeof val === "string" ? val : ""}
          onChange={(e) => set(f.id, e.target.value)}
          onBlur={onBlurValidate}
          onKeyDown={onKey}
          placeholder={f.placeholder}
          aria-invalid={!!error}
          className={cn(
            "mt-[11px] h-auto rounded-[4px] px-[15px] py-3.5 text-base tabular-nums md:text-base",
            mono && "font-mono",
          )}
          style={{ maxWidth: f.w ?? "100%" }}
        />
      )}

      {f.type === "area" && (
        <Textarea
          id={f.id}
          rows={3}
          value={typeof val === "string" ? val : ""}
          onChange={(e) => set(f.id, e.target.value)}
          onBlur={onBlurValidate}
          placeholder={f.placeholder}
          aria-invalid={!!error}
          className="mt-[11px] resize-y rounded-[4px] px-[15px] py-3.5 text-base leading-normal md:text-base"
        />
      )}

      {f.type === "radio" && (
        <RadioGroup
          value={typeof val === "string" ? val : ""}
          onValueChange={(v) => set(f.id, v)}
          aria-label={f.label}
          aria-invalid={!!error}
          className="mt-3 gap-2"
        >
          {(f.options as [string, string, string][]).map(
            ([id, label, note]) => {
              const on = val === id;
              return (
                <Label
                  key={id}
                  htmlFor={`${f.id}-${id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[4px] border bg-raised px-4 py-3.5 text-[15.5px] font-normal transition-colors duration-150",
                    on
                      ? "border-accent bg-[color-mix(in_oklab,var(--pv-accent)_5%,white)]"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <RadioGroupItem id={`${f.id}-${id}`} value={id} />
                  <span>{label}</span>
                  {note && (
                    <span className="ml-auto font-mono text-xs text-ink-muted">
                      {note}
                    </span>
                  )}
                </Label>
              );
            },
          )}
        </RadioGroup>
      )}

      {f.type === "check" && (
        <div
          role="group"
          aria-label={f.label}
          className="mt-3 grid grid-cols-2 gap-2 max-sm:grid-cols-1"
        >
          {(f.options as string[]).map((label) => {
            const on = arr.includes(label);
            return (
              <Label
                key={label}
                htmlFor={`${f.id}-${label}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[4px] border bg-raised px-4 py-3 text-[15px] font-normal transition-colors duration-150",
                  on
                    ? "border-accent bg-[color-mix(in_oklab,var(--pv-accent)_5%,white)]"
                    : "border-line hover:border-line-strong",
                )}
              >
                <Checkbox
                  id={`${f.id}-${label}`}
                  checked={on}
                  onCheckedChange={() =>
                    set(
                      f.id,
                      on ? arr.filter((x) => x !== label) : [...arr, label],
                    )
                  }
                />
                <span>{label}</span>
              </Label>
            );
          })}
        </div>
      )}

      {f.type === "chips" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(f.options as string[]).map((label) => {
            const on = f.single ? val === label : arr.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  f.single
                    ? set(f.id, on ? "" : label)
                    : set(
                        f.id,
                        arr.includes(label)
                          ? arr.filter((x) => x !== label)
                          : [...arr, label],
                      )
                }
                className={cn(
                  "cursor-pointer rounded-[4px] border px-[15px] py-[11px] text-[15px] transition-colors duration-150",
                  on
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-raised text-ink hover:border-line-strong",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div
          aria-live="polite"
          className="mt-[9px] text-[13.5px] leading-snug text-danger"
        >
          {error}
        </div>
      )}
    </div>
  );
}
