# Prime PEO Brokers

Marketing site, six-step discovery flow, and internal leads console for the
Prime PEO Brokers PEO/payroll/HR brokerage. Next.js 16 (App Router) + Supabase
(Postgres, Auth, RLS) + Resend for transactional email.
Every discovery flow, complete or partial, is captured, stored, and
surfaced to the team. Multi-tenancy is designed into the data model from
day one (see `docs/data-model.md`).

## Map

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

3. **Env**: copy `.env.example` to `.env.local` and fill it in. Without
   `RESEND_API_KEY` everything works except email (skipped with a warning).

4. **Run**:

   ```bash
   pnpm install
   pnpm dev
   ```

## Deploying

Deploy to Netlify (client's account) or Vercel; set the env vars from
`.env.example` with `NEXT_PUBLIC_SITE_URL` as the production domain. Deploy
previews work out of the box, and the SOW asks for preview links throughout
Phase 1.

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

Phase 3 is partner-facing and not started: per-partner subdomains, wildcard
DNS, branding from `tenants.branding`, and partner logins. The "Providers"
nav item is stubbed for it. Multi-tenancy is already in every table and
policy, so partner isolation comes from the existing RLS rather than new
code.

Two things deliberately left as they are, both worth raising with the client
rather than quietly changing:

- The CSV export sends every lead, ignoring the filters active on the list
  the button sits above. Changing that changes what the button means.
- The privacy page promises 30-day deletion and nothing implements it: no
  TTL, no cron, no delete policy on any table. A Phase 1 gap, not a Phase 2
  one.
