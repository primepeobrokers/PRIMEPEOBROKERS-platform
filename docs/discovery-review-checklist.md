# Discovery flow review: verification and task checklist

Source: client punch list for the "Start shopping" flow, reviewed 2026-09-16
against `main` (05d2fd1). Local `main` is in sync with `origin/main`, so the
deployed site at prime-vintage.vercel.app runs this code.

## Status (2026-09-16)

Implemented in the working tree, not yet committed: A1, A2, A3, A4 (with the
$NaN fix), B1, B2, B3, B4, B6, B7 (including the hidden-answer strip on
submit), B8, D1, D2, D3, D4 (native date input), D5, D6, D7. B5 was
resolved by B1 and needs no layout change. A5 needs a check in the Vercel
dashboard, not code. C1 to C3 are held for a separate agreement; C4 needed
no work. Verified with `pnpm check`, `pnpm build`, and Playwright
screenshots of every step on desktop and iPhone 13 widths.

Open decisions for the client: whether salary bands return (D3), and
whether hourly vs salaried classification matters for quoting (D1).

Files that matter:

- `lib/discovery/schema.ts`: the six steps, every field, per-field widths,
  visibility rules, validation, and the per-step summary key.
- `app/discovery/discovery-flow.tsx`: the flow UI, the record rail, the
  review screen, the save bar, the field renderer.
- `app/discovery/actions.ts`: draft save, submit, resume link.
- `app/globals.css`: tokens and the input focus override.
- `supabase/migrations/0001_init.sql`: `steps_completed` check constraint.

Verdict legend: **Confirmed** (code matches the complaint), **Partly**
(symptom real, diagnosis or scale differs), **Not a bug** (already done or
not in our code), **Cannot verify** (needs a browser or the Vercel dashboard).

## A. Bugs

### A1. Save bar covers Continue. Confirmed.

The bar is `fixed inset-x-0 bottom-0` and `main` only reserves `pb-24`
(96px). The bar is about 100px tall on one row and about 160px when its
input row wraps, so the Back / Continue row is hidden on any screen where
the form does not scroll well clear. The `abandon` state is never reset on
step change, so once the bar opens it stays on every following step.

This is also why the reviewer never saw the review screen (see C4).

- [x] Reserve space: when `abandon` is true, add bottom padding to `main`
      equal to the bar height (measure with a ref, or a fixed
      `pb-[180px]`), or make the bar `sticky` inside the layout rather than
      `fixed`.
- [x] Close the bar automatically on step change (`setAbandon(false)` in
      `goNext` / `goTo`), or at least when the user clicks Continue.
- [x] Re-test on a 768px-tall laptop viewport and on a phone.

### A2. Email error appears with an untouched field. Partly.

`resumeError` is only set by `requestResumeLink`, which runs on "Send the
link". So the error does not fire on mount. What is wrong:

- `resumeError` is never cleared on "Not now" or on step change, so one
  empty click makes the red text follow the bar to every later step.
- The bar opens on any `mouseout` at `clientY <= 4`, which is where the
  pointer goes to reach the URL bar or a tab. That reads as "on arrival".

- [x] Clear `resumeError` in the "Not now" handler and whenever the bar
      opens or the step changes.
- [x] Validate the resume email client-side before calling the server
      action; show the message inline under the input, not in the copy
      column.
- [x] Disable "Send the link" while the field is empty.
- [x] See D6 for the trigger itself.

### A3. Record rail shows odd summaries. Partly.

The reviewer's diagnosis ("derived from the last field") is wrong. Each step
declares an explicit `key` and optional `summaryFmt` in `StepDef`, and
`stepSummary()` reads only that one field. The symptom is real because the
keys are poorly chosen:

| Step | `key` | What it shows |
|---|---|---|
| 2 | `company` | The company name as typed (reviewer typed "d") |
| 4 | `benefitTypes` | Hidden unless "offer benefits" is yes and category is PEO or HRIS, so usually an en dash |
| 5 | `drivers` | The multi-select joined with commas ("Tech limits") |
| 6 | `contactPreference` | "Have an advisor call me" |

- [x] Change `summaryFmt` to take the whole `answers` object, and make it
      required. Drop `key`.
- [x] Write one formatter per step, for example:
      step 2 "Acme · 26-100", step 3 "15 FTE · TriNet", step 4 "Benefits:
      yes · 4 types" or "No benefits today", step 5 "Cost, Growth ·
      1-3 months", step 6 "Call · renewal 2027-01-31".
- [x] Keep the rail cell to one line (`truncate`) since formatted values are
      now longer.
- [x] Update `scripts/check-branching.mts` if it touches `key`.

### A4. Ambiguous money label on step 3. Confirmed, plus an extra bug.

Label is "What you pay them a year", help says "Admin and service fees,
excluding insurance premium. A range is fine." `prefix: true` only affects
`formatAnswer()` on summaries; the input has no `$` and no separators.

Extra: `formatAnswer()` does `"$" + Number(v).toLocaleString()`. The help
text invites a range, and a value like "40,000" or "50k-60k" renders as
`$NaN` on the review screen, in the console, and in the broker email.
`denormalize()` in actions.ts is safe (it null-checks `Number.isFinite`),
so only the display is affected.

- [x] Relabel to "What you pay your current provider a year". Same
      treatment for `spend` on step 4 ("Total benefits spend a year" is
      fine but should match the pattern).
- [x] Add a `$` prefix adornment inside the input for `prefix` fields.
- [x] Format thousands on input (store digits only, display with
      separators) or accept free text and stop calling `Number()`.
- [x] Make `formatAnswer()` fall back to the raw string when `Number(v)` is
      not finite.
- [x] Decide whether "A range is fine" stays. If yes, the field must accept
      non-numeric text end to end.

### A5. Floating red tab on the right edge. Not in our code.

Nothing in the repo renders a fixed element on the right edge. There is no
`@vercel/toolbar` dependency and no `vercel.json`. Our only fixed elements
are the save bar (bottom), the toast (bottom left), and the top loader.

Most likely the Vercel toolbar, which Vercel injects for logged-in team
members on preview and production deployments. It is invisible to the
public.

- [ ] Open the production URL in a private window with no Vercel session
      and confirm the tab is absent.
- [ ] If the reviewer must not see it, disable the toolbar for production
      in the Vercel project settings (Project > Settings > Toolbar), or
      have them turn it off in their own Vercel account.
- [ ] If it is still there in a private window, get a screenshot: it is
      then an extension or something else outside this repo.

## B. Global fixes

### B1. One field width. Confirmed.

Eleven fields carry a `w` in the schema (180, 220, 300, 340, 380, 460px),
applied as `style={{ maxWidth: f.w }}` in the renderer. The reviewer's
measurements are a constant 0.82x of these, so they were reading a scaled
screenshot, but the pattern is exactly as described.

- [x] Remove the `w` property from `FieldDef` and every field.
- [x] Remove the `maxWidth` style in `Field`.
- [x] Add an optional `half?: boolean` (or a `row` group id) so paired
      short fields share one row: name / email, phone / job title,
      company / website, full-time / part-time / contractors, provider /
      accounting software, renewal date / referred by.
- [x] Render paired fields in a two-column grid that collapses under `sm`.

### B2. One control vocabulary. Confirmed.

Four renderers in `Field`: `cards`, `radio` (stacked rows), `check`
(two-column rows), `chips`. The schema already has single-select chips
(`type: "chips", single: true`) and multi-select chips (`chips` without
`single`), so the cheap path is a renderer change, not a schema migration.

- [x] Render `radio` as single-select chips. Keep the stored value as the
      option id (`yes`, `no`) so `when` rules and the console keep working.
      Chips must accept `[id, label, note]` tuples for this.
- [x] Render `check` as multi-select chips. Stored shape (string array)
      does not change.
- [x] Keep `cards` for step 1 only.
- [x] Keep an escape hatch for long option labels (step 4 "HR support you
      need" has four long labels) so chips wrap cleanly.
- [x] Verify with `pnpm check` (check-branching and check-submit exercise
      every field).

Estimated at 2 to 3 hours this way, not 7.

### B3. Yes/No pairs as chips. Confirmed, covered by B2.

Radio rows today: timeTracking, internalHrTeam, benefitsOffered,
hrGuidance, contactPreference, decisionRole, plus atsNeeded and
backgroundChecks for Recruiting. Each row is about 46px plus gap.

- [x] Nothing extra once B2 lands. Re-measure step 4 length after.

### B4. Field polish. Partly.

- Resting border is `--pv-line: #e1e2e6`, a light grey (not pink). It is
  faint on white.
- Focus is a 1px accent border plus a 1px accent box-shadow (globals.css,
  the `[data-slot="input"]:focus-visible` override). Visible, but thin.
- Placeholders missing on: fullName, email, phone, company, fte, pt,
  contractors. Their neighbours have them.
- Heights: inputs about 52px, radio rows about 46px, check rows about
  42px, chips about 40px. Chips and check rows are under 44px.

- [x] Use `--pv-line-strong` (#c3c6cc) as the resting input and chip
      border, or add a new mid token. Change in globals.css only.
- [x] Widen the focus ring to 2px (`0 0 0 2px var(--pv-accent)`), keep it
      in globals.css.
- [x] Add placeholders: "Jane Doe", "jane@acme.com", "(555) 123-4567",
      "Acme Inc", "15", "4", "2".
- [x] Set `min-h-11` on chips, check rows, and radio rows (before B2
      removes the last two).

### B5. Dead space right of the fields. Partly.

The layout is a 1120px container with a 312px rail and 56px gap, so the
card is about 688px wide with 608px of content. The reviewer's 1210px
figure does not match this code at any breakpoint, but the underlying
complaint holds: fields capped at 180 to 460px leave a ragged right edge in
a 608px column.

- [x] B1 (100% width) removes most of this. Re-check after B1 before
      touching the layout.
- [ ] Optional: tighten `max-w-[1120px]` to about 1000px on the flow page
      if it still feels wide.

### B6. Rail upgrade. Confirmed.

Desktop rail has no progress bar or percentage. Mobile already has "Step x
of 6 · y% complete" plus a segmented bar (`hidden max-lg:block`). Answered
steps already show their value in mono. "Not started" is rendered for
every unreached step.

- [x] Move the mobile progress header into a shared component and render
      it at the top of the desktop rail too.
- [x] Drop the "Not started" label; keep the dimmed state.
- [x] Depends on A3 for the summaries to be worth showing.

### B7. Gate conditional fields. Confirmed for one field.

`benefitsBroker` has `not: [...]` but no `when`, so it renders whether or
not benefits are offered. Every other dependent field (timeTrackingMethods,
benefitTypes, benefitsPlatform, spend, managedServices, bestTime) has a
`when`.

- [x] Add `when: { field: "benefitsOffered", is: ["yes"] }` to
      `benefitsBroker`.
- [x] `managedServices` label says "If yes, what kind?" but also shows for
      "Exploring". Relabel to "What kind of support?".
- [x] Check whether answers to fields that later become hidden (pick
      Medical, then switch benefits to No) are stripped before submit. If
      not, filter `answers` through `isFieldVisible` in `submitRecord`.

### B8. SENSITIVE callout on step 3. Confirmed.

Only step 4 has `sensitive: true`. Step 3 collects the provider fee.

- [x] Add `sensitive: true` to step 3 in the schema. The flow header and the
      review screen both read it, so this is one line.

## C. Step structure

Field counts from the schema, for a PEO visitor:

| Step | Fields | Selectable options |
|---|---|---|
| 1 | 1 | 6 tiles |
| 2 | 11 | 4 radio + 10 chips |
| 3 | 9 (6 for HRIS and later) | 6 + 4 + 9 |
| 4 | 13 max (fewer by category and answers) | about 30 |
| 5 | 7 | 36 |
| 6 | 5 to 6 | 2 |

The reviewer's counts are close enough. Uneven length is real.

Hidden cost the review does not mention: the step count is baked in.

- `supabase/migrations/0001_init.sql` has
  `check (steps_completed between 0 and 6)`. A split needs a migration.
- `steps_completed` on existing partial drafts is a step index. After a
  split, resumed drafts land on the wrong step unless remapped.
- `TOTAL_STEPS` is shown in the console lead detail ("x / 6") and used in
  `actions.ts` clamps.
- Copy says "six": `app/layout.tsx` metadata, `app/discovery/page.tsx`
  metadata, `app/page.tsx` (two places plus the step list), `lib/email.ts`
  (four strings: resume and confirmation emails).

### C1. Split step 2. Confirmed as a reasonable change.

- [ ] "About you": fullName, email, phone, jobTitle, decisionRole.
- [ ] "About your company": company, website, industry, employeeCount,
      geography, states.

### C2. Split step 3.

- [ ] "Your workforce": fte, pt, contractors (and employeeTypes if it
      survives D1).
- [ ] "Your current setup": provider, accountingSoftware, payrollFrequency,
      payrollComplexity, fee.

### C3. Split step 5.

- [ ] "Why you are looking": drivers, timeline, budgetPosture.
- [ ] "What you want priced": alsoQuote, techStack, integrations,
      vendorPreferences.

### C0. Renumbering work required by any split.

- [ ] New migration widening the `steps_completed` check to the new count
      (or dropping it in favour of `TOTAL_STEPS` validation in code).
- [ ] Remap `steps_completed` for existing partial drafts, or accept that
      in-flight drafts resume at the start of the nearest old step.
- [ ] Replace every "six" / "of 6" in layout metadata, discovery metadata,
      homepage copy, and email copy with `TOTAL_STEPS` or updated prose.
- [ ] Re-run `pnpm check` (check-branching iterates `STEPS`).
- [ ] Update the homepage step list in `app/page.tsx` if it is derived
      from `STEPS`.

### C4. Add a review screen. Not a bug: it already exists.

`view === "review"` renders every visible answer grouped by step, with an
Edit link per step and the SENSITIVE badge on step 4. The step 6 button
reads "Review your record" and the only submit is on that screen. The
reviewer never reached it because the save bar covered the button (A1).

- [ ] No build work. After A1 is fixed, walk the reviewer to the review
      screen and the confirmation screen so both get reviewed.

## D. Content and copy

### D1. Employee types mixes three axes. Confirmed.

`employeeTypes` is a required six-option checkbox (Full-time, Part-time,
Hourly, Salaried, Seasonal, 1099) directly above fte, pt, and contractors
counts.

- [x] Remove `employeeTypes` from the schema. Export and email flat-map
      `STEPS`, so nothing else needs to change. Old submissions keep the
      key in jsonb harmlessly.
- [ ] Confirm with the client that "hourly vs salaried" is not needed for
      quoting before removing it.

### D2. "Primary reason" is multi-select. Confirmed.

`drivers` is `type: "check"` with help "Select all that apply". The renewal
entry point seeds `drivers = ["Cost"]` as an array.

- [x] Make `drivers` single-select chips ("Primary reason").
- [x] Add an optional multi-select "Anything else driving this?".
- [x] Change the renewal seed to the string `"Cost"`.
- [x] Check `intent === "renewal"` consumers in the console still read the
      value correctly.

### D3. "Bands, not individual salaries" orphan. Confirmed.

A "Salary bands in use" field existed in Phase 1 and was removed in commit
d3f592e (Rebuild discovery). The intro sentence stayed.

- [ ] Ask the client whether salary bands should return. If not, cut the
      sentence from the step 4 intro.

### D4. Renewal date is free text. Confirmed, and unvalidated.

`renewalDate` is `type: "text"` with a mono font and a YYYY-MM-DD
placeholder. The `date: true` flag exists in `FieldDef` but is not set on
this field, so the format check never runs. The console reads the value
with a strict regex to compute runway, so anything else is silently
ignored.

- [x] Add a `date` field type rendering a native `<input type="date">`
      with a "Not sure" toggle that clears the value.
- [x] Set `date: true` so the validator runs as a fallback.

### D5. Header timestamp. Confirmed.

`markSaved()` writes "SAVED HH:MM" in local time.

- [x] Store the save time as a `Date` and render "Saved just now", then
      "Saved 2 min ago", updating on a 30s interval. Keep the mono uppercase
      treatment.

### D6. Save bar interrupts. Confirmed.

Trigger is `mouseout` with `clientY <= 4`, once per mount (`exitShown`
ref). The "Finish later" header button also opens it. Once open it stays
until "Not now", across steps.

- [x] Change the trigger to `visibilitychange` (tab hidden) or
      `beforeunload`, plus the explicit "Finish later" button. Drop the
      top-edge mouseout, or raise the threshold and add a delay.
- [x] Remember dismissal in `sessionStorage` so it does not reopen this
      session.
- [x] Auto-close on step change (also listed under A1).

### D7. Validation copy mentions a missing "Other". New finding.

`validateField()` says "Pick at least one. If none apply, choose Other."
for required chips and checks. None of the required ones (employeeCount,
geography, employeeTypes, drivers, timeline) has an "Other" option.

- [x] Change the message to "Pick at least one." or add an Other option
      where it makes sense.

## What the review got right and needs no work

- Category tiles, chips, the SENSITIVE callout, step 6 proportions, the
  Enter hint, and the step 3 "15 FTE" summary are all as described.
- The review screen (C4) and mobile progress bar (part of B6) already
  exist.

## Not verified here

- Mobile rendering. The layout collapses (`max-lg:grid-cols-1`,
  `max-sm:grid-cols-1` on checks, stacked buttons), and inputs use
  `maxWidth` so they shrink, but no device check was done. The save bar
  wraps to two rows under about 900px, so A1 is worse on a phone.
- Post-submit confirmation screen and emails: code exists (`view ===
  "done"`, `lib/email.ts`) and `pnpm email:preview` renders the templates,
  but the live path was not exercised.

## Suggested order

One-day cut, matching the reviewer's: A1, A2, A3, A4, B1, B4, plus B7, B8
and D7 since each is one line.

Full order: A (bugs), then B1, B4, B2/B3, B6, B7, B8, then D1 to D7 (copy
changes are cheap and several depend on schema edits), then C with the
migration and copy renumbering as one change, then a mobile pass.
