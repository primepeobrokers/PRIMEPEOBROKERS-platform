# Site update list, 29 September 2026

Approved by Garrett Ledford. Supersedes all earlier versions and the v2 tenant copy spec.

This file records the 32 approved items, what each one actually costs to build, and
the answers to the two "verify and report back" items.

## Verdict: mostly text, with three exceptions

Twenty-six of the 32 items are copy edits. Nearly all of the site's text lives in
data arrays at the top of a single file, `app/components/landing/landing-sections.tsx`
(lines 60 to 340), so most of these are edits to a string in one place, not surgery
across the codebase.

Three items are real work:

| Item | Why it is not just text |
| --- | --- |
| 29, HubSpot and CRM attribution | No code exists. Needs schema columns, a partner settings UI, and a write on submit |
| 30, replace all imagery | Sourcing and licensing new photography, plus a video. Judgement, not typing |
| 23, "broker" to "advisor" | 33 files touch the word. Most are internal, but the split has to be made carefully |

Two more need care rather than effort:

- Item 4 and 5 are blocked on Garrett supplying logos and confirming a figure.
- Item 19 asks us to soften a retention claim the code does not implement at all.
  See the note under that item.

Rough shape: about a day for the copy, a day for imagery once assets are chosen,
and one to two days for attribution. Call it three to four days total, with the
caveat that items 4, 5 and C cannot start until Garrett answers.

## Copy rules

One copy set serves every partner type: medical brokers, HR consulting firms, CPAs, advisors.

- Describe the PEO and HCM evaluation only. Never present medical placement, benefits
  brokerage, workers' comp placement, or HR consulting as services offered.
- Never use "broker" in body copy. Use "your advisor" and "our advisory team".
- Respect current relationships without promising nothing changes.
- Do not criticise any provider type, advisor type, or model.
- Prime PEO Brokers appears only in the footer disclosure line on partner sites.
- Partner recruitment language stays on the Prime-facing site, hidden on partner sites.

## 1. Hero

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 1 | Hero subhead | Replace "No pushy vendor reps. You never pay us." with "One advisor, every option. You never pay a fee." | Text |
| 2 | Micro-line under CTAs | Replace the "No sales calls" line with "Free to start · Save and finish later · Renewing? We'll benchmark your deal" | Text |
| 3 | Hero stats | Keep "6 min". Change "broker" in stat labels to "advisor". Use "1 business day" consistently | Text |
| 4 | Provider logo strip | Keep the strip, swap in the real provider logos | **Blocked on Garrett** |
| 5 | Hero case card | Remove the $52,900 / 142 employees / 4 states / $418,200 figures and the "REF 4821" line. Replace with the 38-employee, $170,000 case | **Blocked on Garrett** |
| 6 | Cost comparison line | Add "We compare every option's total cost against what you pay today, including admin fees, benefits, workers' comp, and payroll taxes." | Text |

Item 5 note: the current card is fabricated sample data. Replacing it with a real
placement is an improvement, but the new line needs the annual-or-term answer (open
item B) before it goes live. A savings figure that turns out to be over three years
but reads as annual is the kind of claim that causes trouble later.

## 2. "Why shopping alone is hard"

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 7 | Eyebrow and headline | "WHY DIRECT GOES BADLY" becomes "WHY SHOPPING ALONE IS HARD". Headline becomes "Why comparing PEOs on your own is hard." | Text |
| 8 | Right-side stats | Remove "3 bases", "10–250", "45 days" and their captions. Keep the three descriptions | Text |
| 9 | Typical client label | Remove "TYPICAL CLIENT · 38–217 EMPLOYEES" | Text |
| 10 | Section photo | Replace the warehouse photo with an office image. See item 30 | Asset |

## 3. How it works

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 11 | Step wording | "answer five short steps" becomes "work through six short steps". All "< 1 day" and "1 day" become "1 business day" | Text |

Worth noting: the flow genuinely has six steps, so this corrects a real inaccuracy.

## 4. Landscape table

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 12 | Rows and columns | Remove the "Industry captive" and "HRIS + external broker" rows. Remove the "Where it breaks" and "Quotes" columns. Remove the quote-counts footnote | Text |
| 13 | Final table | Three rows: Full-service PEO (10–150, % of payroll, per employee per month, or per check), ASO Managed HR (25–250, per employee per month), Payroll Only plus Light HR (5–150, per employee per month) | Text |
| 14 | Headline | "Five models, priced on five different bases" becomes "Three models, compared side by side." | Text |
| 15 | Case caption | Replace "142 employees across four states. Three incompatible quotes." with the 38-employee case line, or remove it | Text |

Dropping two columns changes the table's grid layout, so the column widths need
re-setting and checking at mobile width. Still small, but not a pure string swap.

## 5. Partner section

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 16 | Keep on Prime's site | The "For partners" section, the "Refer a client" copy, and its nav and footer links stay | **Already correct** |
| 17 | Hide on partner sites | Hidden on partner-branded sites, no replacement block | **Already built** |

Both are already the live behaviour. `showPartnerSection` in
`landing-sections.tsx:77` is `true` only on the house tenant, and it also filters the
nav and footer links so no dead anchors are left behind. Verified on the live ABS
partner site: the section does not render. No work needed, only confirmation.

The spec calls the flag `show_partner_recruitment`; in the code it is
`showPartnerSection`. Same thing, derived automatically from whether the host is a
partner, so there is nothing to configure per partner.

## 6. Data handling

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 18 | Security claims | Confirm each claim, remove any that cannot be confirmed | **Answered below** |
| 19 | Retention and licensing | Replace the six-year line with "Records for clients we place are retained as long as required by law." Remove "Licensed insurance and PEO brokerage" from body copy | Text, with a caveat |

### Item 18 answer, tested 30 September 2026

| Claim | Verdict | Evidence |
| --- | --- | --- |
| TLS 1.3 in transit | **Confirmed** | Live handshake against primevantagehcm.com negotiates TLSv1.3, `TLS_AES_128_GCM_SHA256` |
| No public or anonymous read path | **Confirmed** | With the public anon key, `submissions` returns 0 rows. The service role returns 26. Non-zero versus zero proves row-level security is filtering, not that the table is empty |
| Access scoped at the data layer | **Confirmed** | Scoping is in database policies, not the interface. The same anon key that renders the site cannot read a single lead |
| AES-256 at rest | **Vendor-attested, not independently verified** | Encryption at rest is provided by the hosting platform. We cannot inspect the cipher from outside. The platform documents AES-256, so the claim is true as far as we can establish, but it rests on their attestation, not our test |
| Deletion within 30 days | **Not implemented** | See below |

Recommendation: keep the first three as they are. For AES-256, either keep it on the
vendor's documentation or soften to "encrypted at rest" which is verifiable and still
accurate. The deletion claim is the one that needs attention.

### The deletion claim

The privacy page and the data-handling section both promise deletion within 30 days.
Nothing in the codebase implements it: there is no scheduled job, no expiry, and no
deletion path. A request today would have to be honoured by hand.

Item 19 rewords the *retention* sentence but leaves the 30-day *deletion* promise in
place. That promise is the one carrying risk, because it is a published commitment
the system cannot keep on its own.

Two honest options:

1. Build it. A scheduled job plus a deletion routine, roughly half a day.
2. Keep the promise and handle requests manually, which is defensible at this volume,
   but someone has to own it and know it is manual.

Flagging rather than deciding. This predates the current list and is not a regression.

## 7. FAQ and CTAs

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 20 | Broker-of-record FAQ | Remove it. Add "Does this affect my current advisors or providers?" with the approved answer | Text |
| 21 | "Is this actually free?" | Replace with "Yes. There's no fee to you. Advisory compensation is paid by the provider you select, and only if you select one." | Text |
| 22 | Contact email | Use the tenant's contact email variable instead of a hardcoded address | **Mostly built** |
| 23 | "Broker" terminology | "your broker" to "your advisor", "our team of brokers" to "our advisory team", "Talk to a broker first" to "Talk to an advisor" | Text, but wide |

Item 22: partner sites already fall back to the tenant's `supportEmail`
(`landing-sections.tsx:69`). One hardcoded `admin@primepeobrokers.com` remains in the
partner recruitment block, which is correct as-is because that section only ever
renders on Prime's own site.

Item 23 detail: "broker" appears in 33 files. The split matters.

- **Change**: the landing copy (30 instances), the discovery flow, the emails in
  `lib/email.ts`, the `/talk` page, and the login and legal pages.
- **Leave**: the console, which staff see and where "broker" is the accurate internal
  word; code comments; and the company name itself, Prime PEO Brokers, which appears
  in the footer disclosure by design.

Mechanical find-and-replace would be wrong here. It would rename the company in its
own disclosure line and rewrite internal tooling nobody asked to change.

## 8. Footer

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 24 | Disclosure line | One line, small type: "PEO and HCM advisory services provided by Prime PEO Brokers." | Text |
| 25 | Photo credits | Remove photo and footage credits | Text, see below |
| 26 | Spelling | "Licence" becomes "License" | Text |

Item 25 caveat: the credits are there because the current photography is used under
licences that require attribution. Removing the credits while keeping those images
would breach the licence. Item 30 replaces all the imagery anyway, so the correct
order is: choose new images first, then remove the credits only if the new licences
permit it. Paid stock usually does. Free Unsplash and Pexels usually do too, but it
should be confirmed per image rather than assumed.

Item 26: "Licence" survives only in code comments and one table cell,
"Licence + commission", which item 13 deletes along with that row. Close to zero work.

## 9. White-label and tenant setup

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 27 | Tenant variables | Title, meta description and copyright use the partner name | **Already built** |
| 28 | Tenant setup fields | Partner name, logo, colours, contact email, booking link, HubSpot partner ID, CRM partner name | Partly built |
| 29 | Lead attribution | Write the tenant's HubSpot partner ID and CRM partner name on every submission | **Real work** |

Item 27 is already live. A partner page today renders its own title, for example
"ABS Partner: the easiest way to shop for PEO, Payroll & HR tech", with the partner's
own favicon and no Prime suffix.

Item 28: partner name, logo, colours and contact email all exist today. Booking link,
HubSpot partner ID and CRM partner name do not. Three new fields on the partner form
plus validation, roughly half a day.

Item 29 is the largest item on the list and has no code at all. It needs:

- Two columns on `submissions` for the partner identifiers, via a migration
- The identifiers stored per tenant, which is item 28
- The discovery submit path writing them onto every lead
- The identifiers carried into the CSV export so the Rep Desk can act on them

One to two days depending on whether this stops at storing the values or has to push
to HubSpot directly. The list says "writes to the contact/deal", which reads like a
live HubSpot integration rather than just recording the ID. That needs confirming,
because it is the difference between half the work and all of it.

## 10. Technical

| # | Item | Change | Effort |
| --- | --- | --- | --- |
| 30 | Site-wide images | Remove every warehouse, plant and industrial image and the hero footage. Replace with office and team imagery | **Real work** |
| 31 | Hero card blank on first load | Fix the animation timing, test desktop and mobile | Small fix |
| 32 | Floating red "Z" icon | Check in a clean browser | **Answered below** |

Item 30 covers four assets: the hero video and its poster frame, the
"Why shopping alone is hard" photo, and the full-width band under the landscape
table. The code change is trivial; the work is sourcing images that are correctly
licensed, consistent in tone, and neutral enough to sit under any partner's brand
colours. Half a day to a day, mostly selection rather than typing.

Item 31: the card's fields fade in on a stagger of 300 to 450 milliseconds. If the
reveal fires before the content is painted, the card reads as blank on a slow first
load. Straightforward to fix, and worth testing on a throttled connection rather than
a warm cache, since that is the condition that shows it.

### Item 32 answer

Nothing in the codebase renders a floating red "Z". There is no such element, and no
overlay positioned on the right edge. The site's only red is the brand orange, used
on buttons and the logo.

Almost certainly a browser extension on the reviewing machine. Worth one check in a
private window with extensions disabled. No code action unless it reappears there, in
which case a screenshot showing it would help.

## Open items

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| A | Provider logo files for the strip | Garrett | Item 4 |
| B | Is the $170,000 annual or over the full term? | Garrett | Items 5 and 15 |
| C | "Talk to an advisor" routing on partner sites: partner or Prime | Garrett | Item 23 |
| D | Security claims confirmation | Developer to Garrett | **Answered above** |
| E | Team photo and client quotes | Garrett | Future |

Open item C is worth deciding early. It is a routing question, not copy: if the
button goes to the partner, each partner needs a destination stored against their
tenant, which is the booking link field in item 28. If it goes to Prime, no new field
is needed. The answer changes what gets built.

## Two things not on the list

Neither was raised, both are worth a decision.

1. **Testimonials are still placeholder.** `lib/content/proof.ts` holds three invented
   people with invented quotes and invented savings figures, currently hidden behind a
   flag. They must not go live. Open item E covers the replacement.

2. **Account registration is open.** Anyone with the URL can create an account. Several
   unknown sign-ups have already come through. They are isolated on their own tenants
   and cannot see Prime's leads, but this should be invite-only. It is a settings
   change, not code.
