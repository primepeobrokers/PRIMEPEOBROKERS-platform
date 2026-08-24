# Prime Vantage — Phase 1

Marketing site, six-step discovery flow, and internal leads console for the
Prime Vantage PEO/payroll/HR brokerage. Next.js 16 (App Router) + Supabase
(Postgres, Auth, RLS) + Resend for transactional email.

Every completed — and partial — discovery flow is captured, stored, and
surfaced to the team. Multi-tenancy is designed into the data model from
day one (see `docs/data-model.md`).

## Map

| Surface | Route | Notes |
| --- | --- | --- |
| Landing page | `/` | Public, indexed |
| Discovery flow | `/discovery` | Public, noindex; resumes via `?r=<token>` |
| Broker console | `/console` | Auth required; leads list, filters, CSV export |
| Lead detail | `/console/leads/[id]` | Full record, history, open-logging |
| Sign in / reset | `/login` | Supabase Auth (email + password) |
| Set password | `/auth/update-password` | Invite & recovery landing |

Key code:

- `lib/discovery/schema.ts` — the six steps: fields, options, validation. One
  file drives the flow UI, server validation, review, console detail, email
  and CSV.
- `app/discovery/actions.ts` — server-only writes (service role), draft
  guarded by `(id, resume_token)`.
- `supabase/migrations/0001_init.sql` — schema + RLS.
- `proxy.ts` — session refresh + console gate (Next 16's middleware).

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com),
   then run the migration — either paste
   `supabase/migrations/0001_init.sql` into the SQL editor, or:

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
previews work out of the box — the SOW asks for preview links throughout
Phase 1.

## Phase boundaries

Phase 1 deliberately excludes: multiple roles/permissions, assignment, status
tracking, notes, partner portals. The schema already anticipates them
(`lead_stage`, `profiles.role`, `tenants`) — see `docs/data-model.md`.
