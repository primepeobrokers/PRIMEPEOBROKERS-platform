# Manual test plan: discovery flow, call requests, emails

Run on production (https://primevantagehcm.com) after the email fix is
deployed. Use a real inbox you control for every email field. Each test is
one thing to do and one thing to see. Tick as you go.

## 0. Before you start

- [ ] The latest commit with `inboxList()` in `lib/tenant/email-brand.ts` is
      on `main` and Vercel shows the deployment as Ready.
- [ ] Open a private window (no Vercel login) so the Vercel toolbar cannot
      confuse you.
- [ ] Have a phone ready for section 8.

## 1. Homepage

- [ ] Scroll to the bottom. Click **Talk to a broker first**. You land on
      `/talk`, not a mail app.
- [ ] Click **Start shopping**. You land on `/discovery` step 1.
- [ ] No red tab floats on the right edge of the page in the private window.

## 2. Talk to a broker (`/talk`)

- [ ] Click **Ask for a call** with everything empty. Two red messages appear
      under Name and Work email. Nothing is sent.
- [ ] Fill Name and your email only. Submit. You see "A broker will call
      you" with a REF number.
- [ ] Within a minute you receive "A broker will call you · REF n".
- [ ] The team inboxes (admin@ and garrett@primepeobrokers.com) receive
      "Call request · REF n · your name". Ask whoever owns those inboxes,
      or check Resend's Emails page for a Delivered status.
- [ ] Sign in to `/console`. The lead is listed as complete, stage New, and
      the detail page shows contact preference "Have an advisor call me"
      and your notes.

## 3. Discovery flow, step by step

Start at `/discovery`, pick **PEO**.

Step 1
- [ ] Click **Continue** with nothing picked. "Pick a category to continue."
- [ ] Pick PEO. The rail shows a tick and "PEO" under step 1.

Step 2
- [ ] Every text input is full width. Name and Email share a row, Phone and
      Job title share a row, Company and Website share a row.
- [ ] Every empty input shows a grey example (Jane Doe, jane@acme.com, and
      so on).
- [ ] "Your role in the decision" is a row of chips, not stacked boxes.
- [ ] Press **Continue** with Name empty. A red message appears under Name
      and the page does not move.
- [ ] Fill Name, Email, Role, Company, Employee count, Geography. Continue.
- [ ] Rail under step 2 reads "Company · employee band", e.g. "Acme Inc ·
      26-100".

Step 3
- [ ] A **SENSITIVE** callout sits under the intro.
- [ ] There is no "Employee types" checkbox group. The step starts with
      Full-time and Part-time counts side by side.
- [ ] The last field reads "What you pay your current provider a year", has
      a `$` inside the box, and typing 48000 shows 48,000.
- [ ] Type letters into that field. They are ignored.
- [ ] Fill Full-time = 15, Provider = TriNet. Continue.
- [ ] Rail under step 3 reads "15 FTE · TriNet".

Step 4
- [ ] The intro does not mention salary bands.
- [ ] Every Yes / No question is a pair of chips.
- [ ] With "Do you offer benefits today?" unanswered, there is no "Benefits
      broker" field.
- [ ] Choose **Yes**. "What is offered", "Benefits platform", "Benefits
      broker" and "Total benefits spend" appear. Pick Medical and Dental.
- [ ] Switch to **No**. All four disappear.
- [ ] Switch back to **Yes**, then Continue.
- [ ] Rail under step 4 reads "2 benefit types".

Step 5
- [ ] "Primary reason for evaluating" allows only one chip at a time.
- [ ] "Anything else driving this?" allows several.
- [ ] Pick Cost and a timeline. Continue.
- [ ] Rail under step 5 reads "Cost · 1-3 months" (or your timeline).

Step 6
- [ ] The renewal date opens a native date picker. Pick a date.
- [ ] Type garbage in it if the browser lets you: **Review your record**
      refuses with a format message.
- [ ] Pick "Have an advisor call me". A "Best time to reach you" field
      appears. Pick "Email me the proposal". It disappears.
- [ ] Click **Review your record**.

## 4. Review and submit

- [ ] Every answer you gave is listed under its step. Money shows as
      $48,000, never $NaN.
- [ ] Steps 3 and 4 carry the SENSITIVE badge.
- [ ] Click **Edit** on step 2, change the company name, click Continue
      through to step 6, then Review again. The new name is shown.
- [ ] Click **Submit the record**. You see "Your record is with Prime’s
      advisory team" with a REF and time.
- [ ] You receive "Your record is in · REF n".
- [ ] Team inboxes receive "New discovery record · REF n · company".
- [ ] `/console` lists the lead as complete with your company name, 15 FTE,
      TriNet, and category PEO.

## 5. Save bar and resume link

Start a fresh flow in a new private window and get to step 3.

- [ ] Click **Finish later**. A bar appears at the bottom. Scroll to the
      bottom of the page: **Back** and **Continue** are fully visible above
      the bar, not hidden behind it.
- [ ] **Send the link** is greyed out while the email box is empty.
- [ ] Type `notanemail` and press Enter. A red message appears under the
      box. Nothing is sent.
- [ ] Click **Not now**. The bar closes and the red message is gone.
- [ ] Click **Continue** to step 4, then **Finish later**. The bar opens
      clean, with no leftover error.
- [ ] Enter your email and send. Toast says "Link sent". Within a minute
      you receive "Pick up where you left off" (or similar) with a link.
- [ ] Close the window. Open the link from the email. You land on step 4
      with your earlier answers still filled in.
- [ ] Switch to another tab and back. The bar does not reopen (you
      dismissed it this session).

## 6. Header timestamp

- [ ] After any Continue, the header shows "SAVED JUST NOW".
- [ ] Wait a minute without touching anything. It changes to
      "SAVED 1 MIN AGO".

## 7. Focus and controls

- [ ] Tab through step 2 with the keyboard. Each input gets a clear 2px
      orange ring.
- [ ] Empty inputs have a visible grey border, not a near-white one.
- [ ] Chips are at least as tall as the Continue button's text row
      (about 44px). Nothing is fiddly to tap.

## 8. Phone

Open `/discovery` on a real phone.

- [ ] One column everywhere. No sideways scroll on any step.
- [ ] Chips wrap onto multiple lines and stay readable.
- [ ] On step 3, open **Finish later**. Continue and Back remain reachable
      above the bar.
- [ ] Complete a short flow and submit. Same result as section 4.
- [ ] Open `/talk` and submit a request. Same result as section 2.

## 9. Emails, all templates at once

From the repo, with the production env file:

```
npx tsx --conditions=react-server scripts/send-test-emails.mts you@example.com
```

- [ ] Output ends with "all 7 sent".
- [ ] You receive seven emails: resume link, record confirmation, call
      confirmation, lead notification, call-request notification, reset
      code, team invite.
- [ ] Every link inside them opens on `https://primevantagehcm.com`. If any
      opens on `prime-vintage.vercel.app`, the Vercel variable
      `NEXT_PUBLIC_SITE_URL` still needs changing.
- [ ] The sender shows as "Prime PEO Brokers", never "Prime Vantage".
- [ ] Reply to the record confirmation. The reply is addressed to
      admin@primepeobrokers.com.

## 10. Cleanup

- [ ] In `/console`, find the test leads by your company name and mark or
      delete them so the client does not call you.

## If something fails

Note the section number, what you did, what you saw, and a screenshot.
For email failures, also open Vercel > prime-vintage > Logs and search for
`[email]`; the line there names the exact Resend rejection.
