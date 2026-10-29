# Prime PEO Brokers

Marketing site, six-step discovery flow, and internal leads console for the
Prime PEO Brokers PEO/payroll/HR brokerage. Next.js 16 (App Router) + Supabase
(Postgres, Auth, RLS) + Resend for transactional email.
Every discovery flow, complete or partial, is captured, stored, and
surfaced to the team. Multi-tenancy is designed into the data model from
day one (see `docs/data-model.md`).

## Map ##

| Surface | Route | Notes |
| --- | --- | --- |
| Landing page | `/` | Public, indexed |
| Privacy / terms | `/privacy`, `/terms` | Public. Drafts, pending counsel review |
| Discovery flow | `/discovery` | Public, noindex. `?r=<token>` resumes, `?intent=renewal` and `?category=` seed it |
| Broker console | `/console` | Auth required; leads list, filters, CSV export |
| Lead detail | `/console/leads/[id]` | Full record, history, open-logging |
| Sign in / reset | `/login` | Supabase Auth (email + password) |
| Set password | `/auth/update-password` | Invite & recovery landing |

Key code:

- `lib/discovery/schema.ts`: the six steps, their fields, options, branching, and validation. One
  file drives the flow UI, server validation, review, console detail, email
  and CSV.
- `app/discovery/actions.ts`: server-only writes (service role), draft
  guarded by `(id, resume_token)`.
- `supabase/migrations/`: schema and RLS. All migrations are idempotent.
- `app/components/ui/`: shadcn/ui components, wired to the `--pv-*` tokens.
- `lib/content/proof.ts`: home-page testimonials, currently placeholder and
  flagged off. Do not launch with them.
- `app/console/team/`: admin-only team and pipeline settings (Phase 2).
- `lib/auth/session.ts`: the guard every page and action starts with.
  `requireUser` / `requireAdminPage` for pages (they redirect or 404),
  `guardAction` for actions (it returns a result, because a redirect thrown
  inside a transition would discard what the person was typing).
- `lib/console/`: the console's shared modules. `columns.ts` is the single
  source of truth for the submissions row shape, `query.ts` owns the leads
  filter URL, `stages.ts` the pipeline helpers (client-safe) and
  `stages.server.ts` the reads.
- `scripts/check-*.mts`: run with `npm run check`, which also runs `tsc` and
  eslint. They assert the things TypeScript cannot see: that the select list
  and the row type agree, that filters round-trip through the URL, that stage
  tones map to real Badge variants, and that every server action guards
  before it writes.
- `proxy.ts`: session refresh and the console gate (Next 16's middleware).

## Design system

Colours are defined once as `--pv-*` custom properties in `app/globals.css`
and bridged to Tailwind utilities through `@theme inline`. shadcn's
`--background` / `--primary` / `--border` are aliases of the same tokens, so
there is one palette rather than two. Change a colour there, never inline.

Palette comes from the brand guide in `docs/brand/`: navy `#19233B`, orange
`#FF2D00`, white. The greys are derived by mixing navy into white.

The orange measures 3.73:1 on white, which fails WCAG AA for normal text. Use
it for large text, bold button labels, and the logo mark. Body copy is navy or
`--pv-ink-muted` (5.48:1).

Type deliberately departs from the guide, which specifies Gotham (a paid
Hoefler face) and Arial. We use Archivo for display and Libre Franklin for
body.

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com),
   then run the migrations, either pasting
   the files in `supabase/migrations/` into the SQL editor in order, or:

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

2. **Auth settings** (Supabase dashboard → Authentication):
   - URL configuration → Site URL: your production origin; add
     `http://localhost:3000` to redirect URLs.
   - Email templates → point the *Invite user* and *Reset password* actions at
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
     (resp. `type=recovery`).
   - Create the first staff account: Authentication → Users → *Invite user*.
     The invite email lands on the set-password screen; a profile row is
     created automatically.

3. **Storage** (Supabase dashboard → Storage): create a bucket named
   `tenant-logos`, **public**, no file size limit, allowed MIME types
   `image/*`.

   No migration creates this: Supabase buckets are not part of the SQL schema.
   Partner logo upload writes here, so without it the Partners screen fails
   with a bucket-not-found error from inside the storage client. Any image
   format and size is accepted (client decision, Oct 2026); the browser
   uploads straight to Storage through a signed URL, so no server request
   limit applies.

   Verify with `pnpm check:storage`, which asserts all of the above.

4. **Env**: copy `.env.example` to `.env.local` and fill it in. Without
   `RESEND_API_KEY` everything works except email (skipped with a warning).

5. **Run**:

   ```bash
   pnpm install
   pnpm dev
   ```

## Deploying

Production runs on Vercel at `primevantagehcm.com`. Partner portals are one
label in front of the apex (`acme.primevantagehcm.com`), which needs three
things outside this repo:

- **Vercel domains**: the apex, `www` (redirecting to the apex) and the
  wildcard `*.primevantagehcm.com`. The wildcard only works while the
  domain's nameservers point at Vercel, so DNS for the zone is managed in
  Vercel too. `*.domain` does not cover the apex; add all three.
- **Supabase Auth**: Site URL `https://primevantagehcm.com`, and
  `https://primevantagehcm.com/**` plus `https://*.primevantagehcm.com/**`
  in the redirect allow list. A partner's invite link lands on their own
  subdomain so the session cookie is set on the right host.
- **Resend**: `primevantagehcm.com` verified as a sending domain (DKIM TXT,
  plus MX and SPF for the `send.` return path). Every email goes out from
  the one address in `EMAIL_FROM`; only the display name changes per tenant.

Environment, from `.env.example`: `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_APEX_HOST` name the apex (the second without a scheme and must
agree with the host literal in `proxy.ts`, which `scripts/check-proxy.mts`
asserts). `LEAD_NOTIFY_EMAIL` is the house inbox that receives a copy of every
submission from every portal.

Preview deployments serve the house site only: `*.vercel.app` classifies as
the apex, and the proxy matcher names the production apex, so partner
subdomains cannot be exercised on a preview.

## Cache and revalidation

Every console page is dynamic, so the thing that goes stale is the client
router cache: change a stage, navigate back to the list, and it can serve a
cached payload showing the old value.

The rule: **every mutating server action revalidates the paths that render
what it changed, before it returns.** For the lead detail route that means
the literal `revalidatePath("/console/leads/[id]", "page")`. The `"page"`
argument is required for a dynamic segment and omitting it is a silent no-op,
and the bracket form is deliberate: interpolating a real id would invalidate
only the lead being edited. `logRecordOpen` is the one exception and must not
revalidate, since it fires from a mount effect and would loop.

`scripts/check-actions.mts` enforces all of this.

## Phase boundaries

Phase 1 captured leads. Phase 2 added the team layer: staff accounts by
invite, admin and member roles, assignment, a lead pipeline the client can
edit at runtime, append-only internal notes, and an activity log. See
`docs/data-model.md` for the schema decisions and `supabase/migrations/0005`
and `0006` for the data layer.

Phase 3 is the partner layer: every partner is a `tenants` row served on its
own subdomain, with branding from `tenants.branding` (name, logo, colours and
the partner's contact address), a read-only leads portal, and logins issued
from `/console/partners`. Platform staff see across every tenant through
`tenant_scope()` (migration 0009); partners see only their own. Leads submit
through the partner's themed discovery form, and both the partner's contact
address and the house inbox are told, with the lead's own confirmation sent
in the partner's name. A partner's subdomain root serves their own branded
marketing page (`app/partner-home/`, rendered by
`app/components/landing/landing-sections.tsx`, which the house page at
`app/page.tsx` also renders with `tenant={null}`). See `lib/tenant/` for host
resolution and branding, `supabase/migrations/0009` to `0013` for the data
layer.

**`app/page.tsx` must stay statically prerendered.** It renders the shared
landing sections with `tenant={null}` and reads no headers, which is what
keeps it `○` in the build output. Calling `getTenant()` there (directly or
through the root layout) would turn the house marketing page dynamic. Only
`/partner-home` is `ƒ`, and only partner hosts reach it.

Two things deliberately left as they are, both worth raising with the client
rather than quietly changing:

- The CSV export sends every lead, ignoring the filters active on the list
  the button sits above. Changing that changes what the button means.
- The privacy page promises 30-day deletion and nothing implements it: no
  TTL, no cron, no delete policy on any table. A Phase 1 gap, not a Phase II
  one.
