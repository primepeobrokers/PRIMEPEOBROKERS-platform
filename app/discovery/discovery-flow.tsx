"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  STEPS,
  TOTAL_STEPS,
  formatAnswer,
  sanitizeAnswers,
  stepSummary,
  validateField,
  validateStep,
  visibleFields,
  type Answers,
  type Category,
  type FieldDef,
} from "@/lib/discovery/schema";
import { CheckIcon } from "lucide-react";
import { CategoryIcon } from "./category-icon";
import { cn } from "@/lib/utils";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { TenantMark } from "@/app/components/logo";
import { Checkbox } from "@/app/components/ui/checkbox";
import type { Branding } from "@/lib/tenant/branding";
import { partnerReferrer, voiceFor, withPartnerReferral } from "@/lib/tenant/partner";
import {
  CONSENT_CALL_TEXT,
  CONSENT_TERMS_TEXT,
  SUBMIT_NOTICE_TEXT,
  splitConsentLinks,
} from "@/lib/legal";
import {
  saveDraft,
  submitRecord,
  requestResumeLink,
  type DraftHandle,
} from "./actions";

const STORAGE_KEY = "pv-discovery-draft";
/** Set once the visitor dismisses the resume-link bar; it stays closed for the session. */
const RESUME_DISMISSED_KEY = "pv-discovery-resume-dismissed";
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** "Saved just now", "Saved 2 min ago": relative, because a bare clock time has no context. */
function savedLabelFor(savedAt: Date | null, now: number): string {
  if (!savedAt) return "";
  const mins = Math.floor((now - savedAt.getTime()) / 60_000);
  if (mins < 1) return "Saved just now";
  if (mins < 60) return `Saved ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `Saved ${hours} hr${hours === 1 ? "" : "s"} ago`;
}

/** What the header renders when the host resolved to no tenant at all. */
const HOUSE_TENANT = { isHouse: true, name: "Prime PEO Brokers", branding: {} as Branding };

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
  /**
   * The tenant whose host this is. Drives the header mark and the home link.
   * Null renders the house identity (unknown host, or a lookup failure).
   */
  tenant: { isHouse: boolean; name: string; branding: Branding } | null;
  /**
   * The provider disclosure, rendered by the server page. A slot rather than
   * a prop of the partner's legal name, so this client component does not
   * have to know the disclosure's wording.
   */
  footer?: React.ReactNode;
}

interface Toast {
  title: string;
  body: string;
}

export function DiscoveryFlow({ resumed, intent, presetCategory, tenant, footer }: Props) {
  const isPartner = tenant !== null && !tenant.isHouse;
  // Names Prime in "our team" / "your advisor" copy on a partner's host.
  const v = voiceFor(tenant);
  const brandName = isPartner
    ? (tenant.branding.companyName ?? tenant.name)
    : "Prime PEO Brokers";
  /*
    "/" on every host now. This used to send a partner's lead to "/discovery"
    because "/" on a partner subdomain rewrote to the sign-in portal, and
    dropping a lead onto a login screen mid-form was worse than a link back to
    the form they were already on. "/" is now that partner's own marketing
    page, so it is the right destination again.
  */
  const homeHref = "/";
  // Step 6's "Referred by" answer on a partner's site: their name, locked.
  const referrer = partnerReferrer(tenant);

  // A draft resumed from an emailed link is available at first render.
  // A category in the URL skips the picker; a renewal entry preselects the
  // driver that sent them here.
  const seeded: Answers = {};
  if (presetCategory) seeded.category = presetCategory;
  if (intent === "renewal") seeded.drivers = "Cost";

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
  const [answers, setAnswers] = useState<Answers>(() =>
    withPartnerReferral(resumed?.answers ?? seeded, tenant),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [abandon, setAbandon] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<number | null>(null);
  const [doneAt, setDoneAt] = useState("");
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  /*
    The two consents. Deliberately plain state, never written to answers,
    localStorage or the draft row: counsel requires both to be shown again,
    unticked, whenever a saved draft is resumed, and a consent that silently
    reappeared ticked would be a consent nobody gave in this session. The
    server records them at submission, against the text in lib/legal.ts.
  */
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [callConsent, setCallConsent] = useState(false);

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
          // Through the same sanitiser as the server, so a draft written by an
          // older schema (a removed field, a multi-select that became single)
          // is coerced rather than shown as unselected.
          setAnswers(withPartnerReferral(sanitizeAnswers(saved.answers), tenant));
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

  // ---- exit intent: offer the resume link once, when the tab is left ----
  // The earlier trigger (pointer leaving through the top edge) fired every
  // time someone reached for the URL bar, so the bar read as an interruption
  // rather than a rescue. Tab blur is the moment they are actually leaving,
  // and the offer is waiting when they come back. Dismissal is remembered for
  // the session.
  useEffect(() => {
    const onVisibility = () => {
      if (
        document.visibilityState !== "hidden" ||
        exitShown.current ||
        view !== "flow" ||
        step === 0
      )
        return;
      try {
        if (sessionStorage.getItem(RESUME_DISMISSED_KEY)) return;
      } catch {
        /* storage blocked: fall through and offer once */
      }
      exitShown.current = true;
      setAbandon(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [view, step]);

  // Keep the relative "Saved N min ago" label current.
  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [savedAt]);

  function fireToast(title: string, body: string) {
    setToast({ title, body });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }

  const markSaved = useCallback(() => {
    setSavedAt(new Date());
    setNow(Date.now());
  }, []);

  function openResumeBar() {
    setResumeError("");
    setAbandon(true);
  }

  function closeResumeBar(remember: boolean) {
    setResumeError("");
    setAbandon(false);
    if (remember) {
      try {
        sessionStorage.setItem(RESUME_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

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
    // Moving on is the opposite of leaving: the resume offer closes so it
    // never sits over the next step's buttons.
    if (abandon) closeResumeBar(false);
  }

  function goNext() {
    const stepErrors = validateStep(step, answers);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      return;
    }
    void syncDraft(answers, step + 1);
    if (abandon) closeResumeBar(false);
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

  const phone = answers["phone"];
  const hasPhone = typeof phone === "string" && phone.trim() !== "";

  async function submit() {
    // The button is disabled until this is ticked; the server refuses it too.
    if (busy || !termsAccepted) return;
    setBusy(true);
    try {
      // Let any in-flight draft save finish first, so handleRef points at the
      // existing row rather than submitting a second one.
      await savingChain.current;
      const res = await submitRecord({
        handle: handleRef.current,
        answers,
        // Consent to calls means nothing without a number to cover.
        consent: { terms: termsAccepted, sms: callConsent && hasPhone },
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
    const email = resumeEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setResumeError(
        email
          ? "That address is missing an @ or a domain."
          : "Enter the address the link should go to.",
      );
      return;
    }
    const res = await requestResumeLink({
      handle: handleRef.current,
      answers,
      stepsCompleted: step + 1,
      email,
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
    <div
      className={cn(
        "min-h-screen bg-surface flex flex-col",
        // Reserved on the page, not on <main>, so the footer below main also
        // scrolls clear of the fixed resume bar while it is open.
        abandon && view !== "done" && "pb-[260px] sm:pb-[200px]",
      )}
    >
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-6 px-8 max-sm:px-[18px]">
          {/*
            "Powered by" on a partner's host, in every step's header: counsel
            requires the visitor to be able to see who provides the service
            while they are filling the form in, not only in the footer.
            Stacked under the mark on a phone, where the row has no room for
            it beside the mark and the save controls.
          */}
          <div className="flex min-w-0 items-center gap-3.5 max-sm:flex-col max-sm:items-start max-sm:gap-0">
            <Link href={homeHref} aria-label={`${brandName} home`} className="flex min-h-11 items-center max-sm:min-h-0">
              <TenantMark tenant={tenant ?? HOUSE_TENANT} size={30} />
            </Link>
            {isPartner && (
              <span className="whitespace-nowrap border-l border-line pl-3.5 text-[12px] leading-tight text-ink-soft max-sm:border-l-0 max-sm:pl-0 max-sm:pt-1">
                Powered by Prime PEO Brokers
              </span>
            )}
          </div>
          <div className="flex items-center gap-5">
            <div
              aria-live="polite"
              className="whitespace-nowrap font-mono text-[11.5px] uppercase tracking-[.06em] text-positive-deep"
            >
              {savedLabelFor(savedAt, now)}
            </div>
            {view !== "done" && (
              <button
                type="button"
                onClick={openResumeBar}
                className="cursor-pointer rounded-md border border-line-strong bg-transparent px-3.5 py-2 min-h-11 inline-flex items-center text-[13.5px] font-semibold transition-colors duration-150 hover:border-ink"
              >
                Finish later
              </button>
            )}
          </div>
        </div>
      </header>

      {/* The resume bar is fixed to the bottom edge; while it is open the
          page (the wrapper above) reserves its height so Back / Continue and
          the footer always scroll clear. */}
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-8 pb-24 pt-11 max-sm:px-[18px]">
        {view === "flow" && (
          <div className="grid grid-cols-[312px_1fr] items-start gap-14 [&>*]:min-w-0 max-lg:grid-cols-1 max-lg:gap-7">
            {/* the record, doubling as progress */}
            <aside className="sticky top-[108px] max-lg:hidden">
              <div className="pv-label">Your record</div>
              <div className="mt-3.5">
                <ProgressBar step={step} visited={visited} />
              </div>
              <div className="mt-3.5 overflow-hidden rounded-md border border-line bg-raised">
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
                      data-state={cur ? "current" : done ? "done" : "todo"}
                      onClick={() => reachable && goTo(i)}
                      className="group/step grid w-full cursor-pointer grid-cols-[22px_1fr] items-start gap-3 border-b border-sunken bg-raised px-4 py-[13px] text-left transition-colors duration-150 disabled:cursor-default data-[state=current]:bg-[var(--pv-tone-accent-bg)]"
                    >
                      <span className="pt-0.5 font-mono text-xs text-ink-disabled group-data-[state=current]/step:text-accent group-data-[state=done]/step:text-positive">
                        {done ? (
                          <CheckIcon className="mt-px size-3.5" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="block">
                        <span
                          className={
                            reachable
                              ? "block text-sm font-medium text-ink group-data-[state=current]/step:font-semibold"
                              : "block text-sm font-medium text-ink-faint"
                          }
                        >
                          {s.title}
                        </span>
                        {(done || cur) && (
                          <span className="mt-1 block truncate font-mono text-xs text-ink-muted">
                            {done ? stepSummary(i, answers) : "In progress"}
                          </span>
                        )}
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
              {/* mobile progress: the rail is hidden under lg */}
              <div className="mb-[22px] hidden max-lg:block">
                <ProgressBar step={step} visited={visited} />
              </div>

              <div
                key={`${step}-${dir}`}
                className="rounded-md border border-line bg-raised p-10 pt-9 shadow-[0_1px_2px_rgba(25,35,59,.05)] max-sm:px-5 max-sm:py-[26px]"
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
                  {v(stepDef.intro)}
                </p>

                {stepDef.sensitive && (
                  <div className="mt-[22px] flex items-start gap-[11px] rounded-md border border-ink bg-tint px-[15px] py-[13px]">
                    <span className="whitespace-nowrap rounded-sm border border-ink px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[.1em]">
                      Sensitive
                    </span>
                    {/*
                      Who can see this step, worded per site: on a partner's
                      site the partner who referred the visitor sees the
                      record too, as section 1 of the privacy policy says.
                    */}
                    <span className="text-[13.5px] leading-normal text-ink-soft">
                      {isPartner
                        ? "Stored with encryption at rest and never exposed through a public endpoint. Visible only to Prime\u2019s advisory team and the partner who referred you, never to a provider without your approval."
                        : "Stored with encryption at rest and never exposed through a public endpoint. Visible only to Prime\u2019s advisory team, never to a provider without your approval."}
                    </span>
                  </div>
                )}

                <div className="mt-8 flex flex-col gap-[30px]">
                  {pairFields(visibleFields(step, answers)).map((row) => {
                    const cells = row.map((f) => (
                      <Field
                        key={f.id}
                        field={{
                          ...f,
                          label: v(f.label),
                          help: f.help && v(f.help),
                          placeholder: f.placeholder && v(f.placeholder),
                        }}
                        answers={answers}
                        error={errors[f.id] ?? ""}
                        lockedNote={
                          f.id === "referredBy" && referrer
                            ? `Filled in for you, because you started on ${referrer}\u2019s site.`
                            : undefined
                        }
                        onKey={onKey}
                        set={set}
                        onBlurValidate={() => {
                          const e = validateField(f, answers);
                          setErrors((prev) => ({ ...prev, [f.id]: e }));
                        }}
                      />
                    ));
                    // Counsel: the call consent sits right beside the
                    // number it covers.
                    if (row.length === 1 && row[0].id === "phone") {
                      return (
                        <div key="phone+consent" className="flex flex-col gap-3.5">
                          {cells}
                          <ConsentCheck
                            id="pv-consent-call"
                            checked={callConsent && hasPhone}
                            onChange={setCallConsent}
                            disabled={!hasPhone}
                            note={hasPhone ? undefined : "Add a phone number above to choose this. It is optional."}
                          >
                            {CONSENT_CALL_TEXT}
                          </ConsentCheck>
                        </div>
                      );
                    }
                    if (row.length === 1) return cells;
                    return (
                      <div
                        key={row.map((f) => f.id).join("+")}
                        className="grid grid-cols-2 items-end gap-x-5 gap-y-[30px] max-sm:grid-cols-1"
                      >
                        {cells}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-[38px] flex items-center justify-between gap-4 border-t border-sunken pt-[26px] max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:w-full max-sm:[&>*]:text-center">
                  <button
                    type="button"
                    onClick={() =>
                      step === 0 ? openResumeBar() : goTo(step - 1)
                    }
                    className={cn(
                      "h-12 cursor-pointer rounded-md border border-line-strong bg-transparent px-5 text-[15px] font-semibold transition-colors duration-150 hover:border-ink",
                      step === 0 ? "text-ink-muted" : "text-ink",
                    )}
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
                      className="cursor-pointer rounded-md border border-accent bg-accent px-6 py-3.5 text-[15.5px] font-semibold text-white transition-all duration-150 hover:bg-accent-press active:translate-y-px max-sm:w-full"
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
              Check the record before it goes to your Prime advisor.
            </h1>
            <p className="mt-3.5 max-w-[58ch] text-base leading-normal text-ink-soft">
              Nothing here is shared with a provider until you approve the
              shortlist. Edit any answer and you return to this page.
            </p>
            <div className="mt-[30px] overflow-hidden rounded-md border border-line bg-raised">
              {STEPS.map((s, i) => (
                <div key={s.title} className="border-b border-line last:border-b-0">
                  <div
                    data-sensitive={s.sensitive ? "true" : undefined}
                    className="flex items-baseline justify-between gap-5 border-b border-sunken bg-sunken px-[22px] py-3.5 data-[sensitive]:bg-tint"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[11.5px] text-ink-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-[16.5px] font-semibold">
                        {s.title}
                      </span>
                      {s.sensitive && (
                        <span className="rounded-sm border border-ink px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[.1em]">
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
                    <Fragment key={f.id}>
                      <ReviewRow label={v(f.label)} value={formatAnswer(f.id, answers)} />
                      {/*
                        The call consent, under the number it covers. Not an
                        answer (it is never saved to the draft), so it is
                        added here rather than read from the schema. Edit
                        on this step goes to the box itself.
                      */}
                      {f.id === "phone" && (
                        <ReviewRow
                          label="Call consent"
                          value={callConsent && hasPhone ? "Yes" : "No"}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
            {/*
              The agreement, directly above Submit. Counsel's wording, from
              lib/legal.ts, so what is shown here is byte for byte what the
              consent record stores. Unticked on every visit to this screen,
              including after a resumed draft: see the consent state above.
            */}
            <div className="mt-7 rounded-md border border-line bg-raised px-[22px] py-5">
              <ConsentCheck
                id="pv-consent-terms"
                checked={termsAccepted}
                onChange={setTermsAccepted}
              >
                {splitConsentLinks(CONSENT_TERMS_TEXT).map((part) =>
                  part.href ? (
                    <a
                      key={part.text}
                      href={part.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
                    >
                      {part.text}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span key={part.text}>{part.text}</span>
                  ),
                )}
              </ConsentCheck>
            </div>
            <div className="mt-6 flex items-start justify-between gap-4 max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:text-center">
              <button
                type="button"
                onClick={() => goTo(TOTAL_STEPS - 1)}
                className="cursor-pointer rounded-md border border-line-strong bg-transparent px-5 py-[13px] text-[15px] font-semibold"
              >
                Back to step 6
              </button>
              <div className="flex max-w-[46ch] flex-col items-end gap-3 max-sm:max-w-none max-sm:items-stretch">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !termsAccepted}
                  aria-describedby="pv-submit-notice"
                  className="cursor-pointer rounded-md border border-accent bg-accent px-[26px] py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-wait"
                  aria-busy={busy || undefined}
                >
                  {busy ? "Submitting…" : "Submit"}
                </button>
                <p
                  id="pv-submit-notice"
                  className="text-right text-[13px] leading-normal text-ink-soft max-sm:text-left"
                >
                  {SUBMIT_NOTICE_TEXT}
                </p>
              </div>
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
              Your record is with Prime’s advisory team.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[17px] leading-normal text-ink-soft">
              A licensed Prime advisor has your record in front of them. Here
              is the sequence from here.
            </p>
            <div className="mt-[30px] rounded-md border border-line bg-raised">
              {[
                {
                  when: "Within 1 day",
                  what: "Your Prime advisor reads the record",
                  detail:
                    "If anything is ambiguous (classification, the renewal date, the bundled fee) they ask you before quoting.",
                },
                {
                  when: "Days 1–2",
                  what: "You approve the shortlist",
                  detail:
                    v("They name the providers they intend to quote. Nothing leaves our team until you confirm that list."),
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
            {/* homeHref, not "/": both resolve to the same path today, but
                the constant above is where the partner-host reasoning lives,
                so the two cannot drift apart again. This used to be gated
                behind !isPartner, back when "/" on a partner host rewrote to
                their sign-in portal. It no longer does, and the stale guard
                left every partner lead on a dead end. */}
            <div className="mt-7 flex flex-wrap gap-3.5">
              <Link
                href={homeHref}
                className="rounded-md bg-accent px-[22px] py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-accent-press"
              >
                Back to {brandName}
              </Link>
            </div>
            <p className="mt-6 text-sm leading-normal text-ink-muted">
              Something wrong in the record? Reply to the confirmation email and
              it is corrected before quoting starts.
            </p>
          </div>
        )}
      </main>

      {footer && (
        <footer className="border-t border-line">
          <div className="mx-auto w-full max-w-[1120px] px-8 py-7 max-sm:px-[18px]">{footer}</div>
        </footer>
      )}

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
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <label htmlFor="pv-resume" className="sr-only">
                  Email for your resume link
                </label>
                <input
                  id="pv-resume"
                  type="email"
                  value={resumeEmail}
                  onChange={(e) => {
                    setResumeEmail(e.target.value);
                    if (resumeError) setResumeError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void sendLink();
                    }
                  }}
                  placeholder="you@company.com"
                  aria-invalid={!!resumeError}
                  aria-describedby={resumeError ? "pv-resume-error" : undefined}
                  className="min-h-11 w-[236px] rounded-md border border-line-strong bg-raised px-3.5 py-3 text-[15px] focus:border-accent focus:shadow-[0_0_0_2px_var(--pv-accent)] focus:outline-none aria-invalid:border-danger max-sm:w-full"
                />
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={resumeEmail.trim() === ""}
                  className="min-h-11 cursor-pointer rounded-md border border-accent bg-accent px-[18px] py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send the link
                </button>
                <button
                  type="button"
                  onClick={() => closeResumeBar(true)}
                  className="min-h-11 cursor-pointer px-2 py-3 text-sm text-ink-muted underline"
                >
                  Not now
                </button>
              </div>
              {resumeError && (
                <div
                  id="pv-resume-error"
                  aria-live="polite"
                  className="mt-2 text-[13.5px] text-danger"
                >
                  {resumeError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-7 left-7 z-60 flex max-w-[380px] items-start gap-3 rounded-md bg-dark px-[19px] py-[15px] text-dark-ink shadow-[0_12px_28px_-12px_rgba(25,35,59,.5)]"
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

/* ---------- review ---------- */

/** One label/answer line on the review screen. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[240px_1fr] items-baseline gap-6 border-b border-surface px-[22px] py-[13px] max-sm:grid-cols-1 max-sm:gap-1.5">
      <div className="text-[14.5px] text-ink-muted">{label}</div>
      <div className="font-mono text-[14.5px]">{value}</div>
    </div>
  );
}

/* ---------- consent ---------- */

/**
 * A consent checkbox with its full wording as the label.
 *
 * The whole sentence is the label, so the click target is the paragraph and
 * not an 18px box, and a screen reader announces exactly what is being agreed
 * to. Unchecked by default; the caller owns the state.
 */
function ConsentCheck({
  id,
  checked,
  onChange,
  disabled,
  note,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why the box is disabled, shown under it and announced with it. */
  note?: string;
  children: React.ReactNode;
}) {
  const noteId = note ? `${id}-note` : undefined;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(c) => onChange(c === true)}
        disabled={disabled}
        aria-describedby={noteId}
        className="mt-[3px] size-[18px] cursor-pointer border-line-strong bg-raised data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white"
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            "block text-[13.5px] leading-relaxed text-ink-soft [text-wrap:pretty]",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
        >
          {children}
        </label>
        {note && (
          <p id={noteId} className="mt-1 text-[12.5px] text-ink-muted">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- progress ---------- */

/**
 * "Step 3 of 6 · 50%" plus one segment per step. Shared by the desktop rail
 * and the mobile header so the two never drift apart.
 */
function ProgressBar({ step, visited }: { step: number; visited: number[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[11.5px] uppercase tracking-[.1em] text-ink-muted">
        <span>
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span>{Math.round(((step + 1) / TOTAL_STEPS) * 100)}%</span>
      </div>
      <div className="mt-2.5 flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            data-state={
              i === step
                ? "current"
                : visited.includes(i) && i < step
                  ? "done"
                  : "todo"
            }
            className="h-1 flex-1 rounded-sm bg-sunken transition-colors duration-250 data-[state=current]:bg-accent data-[state=done]:bg-positive"
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- field renderer ---------- */

/**
 * Groups consecutive `half` fields into rows of two. A lone half field (its
 * partner hidden for this visitor) falls back to a full-width row.
 */
function pairFields(fields: FieldDef[]): FieldDef[][] {
  const rows: FieldDef[][] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.half && next?.half) {
      rows.push([f, next]);
      i++;
    } else {
      rows.push([f]);
    }
  }
  return rows;
}

/** Radio options are [id, label, note] tuples; chips and checks are plain labels. */
function optionTuples(f: FieldDef): [string, string, string][] {
  return (f.options ?? []).map((o) =>
    Array.isArray(o) ? o : [o, o, ""],
  );
}

/** "48000" -> "48,000" for display; the stored value stays digits only. */
function withThousands(v: string): string {
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/*
  One control vocabulary. Every choice, single or multi, is a chip: an
  outlined pill that fills with the accent when selected. Single-select
  (radio, single chips) and multi-select (check, chips) share the look; the
  only difference is whether picking one clears the others. Tiles remain for
  the category choice alone, which is the one decision that deserves the room.
*/
function Chip({
  on,
  onClick,
  label,
  note,
  role,
  id,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  note?: string;
  role: "radio" | "checkbox";
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-[15px] py-[10px] text-left text-[15px] leading-snug transition-colors duration-150",
        on
          ? "border-accent bg-accent font-medium text-white"
          : "border-line-strong bg-raised text-ink hover:border-ink",
      )}
    >
      {label}
      {note && (
        <span
          className={cn(
            "font-mono text-xs",
            on ? "text-white/80" : "text-ink-muted",
          )}
        >
          {note}
        </span>
      )}
    </button>
  );
}

function Field({
  field: f,
  answers,
  error,
  lockedNote,
  set,
  onKey,
  onBlurValidate,
}: {
  field: FieldDef;
  answers: Answers;
  error: string;
  /**
   * Set when the value is decided by the site, not the visitor (the referrer
   * on a partner's site). The input becomes read-only and this replaces the
   * help line, saying why. Text fields only.
   */
  lockedNote?: string;
  set: (id: string, value: Answers[string]) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onBlurValidate: () => void;
}) {
  const val = answers[f.id];
  const mono = f.type === "num" || f.mono;
  const arr = Array.isArray(val) ? val : val ? [String(val)] : [];
  const single = f.type === "radio" || (f.type === "chips" && f.single);
  const isChoice =
    f.type === "radio" || f.type === "check" || f.type === "chips";
  const errorId = `${f.id}-error`;
  const helpId = `${f.id}-help`;
  const help = lockedNote ?? f.help;

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
                  "group flex min-w-0 cursor-pointer items-start gap-3.5 rounded-md border bg-raised px-[18px] py-4 text-left transition-all duration-150",
                  on
                    ? "border-accent shadow-[0_0_0_1px_var(--pv-accent)]"
                    : "border-line hover:border-line-strong",
                )}
              >
                <CategoryIcon
                  id={c.id}
                  className={cn(
                    "mt-0.5 size-5 shrink-0 transition-colors duration-150",
                    on ? "text-accent" : "text-ink-muted",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-semibold">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-pretty text-[13.5px] leading-snug text-ink-muted">
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

  const inputClass = cn(
    "mt-[11px] h-auto min-h-11 rounded-md px-[15px] py-3.5 text-base tabular-nums md:text-base",
    mono && "font-mono",
  );

  return (
    <div>
      <Label
        htmlFor={isChoice ? undefined : f.id}
        id={isChoice ? `${f.id}-label` : undefined}
        className="block text-[14.5px] font-semibold text-ink"
      >
        {f.label}
      </Label>
      {help && (
        <div id={helpId} className="mt-[5px] text-[13.5px] leading-snug text-ink-muted">
          {help}
        </div>
      )}

      {(f.type === "text" || f.type === "num") && f.date && (
        <Input
          id={f.id}
          type="date"
          value={typeof val === "string" ? val : ""}
          onChange={(e) => set(f.id, e.target.value)}
          onBlur={onBlurValidate}
          onKeyDown={onKey}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputClass, "sm:max-w-[260px]")}
        />
      )}

      {(f.type === "text" || f.type === "num") && !f.date && f.prefix && (
        <div className="relative mt-[11px]">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[15px] flex items-center font-mono text-base text-ink-muted"
          >
            $
          </span>
          <Input
            id={f.id}
            type="text"
            inputMode="numeric"
            value={typeof val === "string" ? withThousands(val) : ""}
            onChange={(e) => set(f.id, e.target.value.replace(/\D/g, ""))}
            onBlur={onBlurValidate}
            onKeyDown={onKey}
            placeholder={f.placeholder}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={cn(inputClass, "mt-0 pl-8")}
          />
        </div>
      )}

      {(f.type === "text" || f.type === "num") && !f.date && !f.prefix && (
        <Input
          id={f.id}
          type="text"
          inputMode={f.type === "num" ? "numeric" : undefined}
          value={typeof val === "string" ? val : ""}
          // readOnly, not disabled: it stays focusable and is read out, and
          // keeps full-contrast text instead of disabled's 50% opacity.
          readOnly={lockedNote !== undefined}
          onChange={lockedNote ? undefined : (e) => set(f.id, e.target.value)}
          onBlur={lockedNote ? undefined : onBlurValidate}
          onKeyDown={onKey}
          placeholder={lockedNote ? undefined : f.placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : lockedNote ? helpId : undefined}
          className={cn(
            inputClass,
            lockedNote && "cursor-default border-line bg-sunken text-ink-soft focus-visible:border-line-strong",
          )}
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
          aria-describedby={error ? errorId : undefined}
          className="mt-[11px] resize-y rounded-md px-[15px] py-3.5 text-base leading-normal md:text-base"
        />
      )}

      {isChoice && (
        <div
          role={single ? "radiogroup" : "group"}
          aria-labelledby={`${f.id}-label`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="mt-3 flex flex-wrap gap-2"
        >
          {optionTuples(f).map(([id, label, note]) => {
            const on = single ? val === id : arr.includes(id);
            return (
              <Chip
                key={id}
                id={`${f.id}-${id}`}
                role={single ? "radio" : "checkbox"}
                on={on}
                label={label}
                note={note}
                onClick={() =>
                  single
                    ? set(f.id, on && f.type !== "radio" ? "" : id)
                    : set(
                        f.id,
                        on ? arr.filter((x) => x !== id) : [...arr, id],
                      )
                }
              />
            );
          })}
        </div>
      )}

      {error && (
        <div
          id={errorId}
          aria-live="polite"
          className="mt-[9px] text-[13.5px] leading-snug text-danger"
        >
          {error}
        </div>
      )}
    </div>
  );
}
