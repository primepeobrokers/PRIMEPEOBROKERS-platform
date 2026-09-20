# Browser tests

Playwright, Chromium only. Run with `pnpm test:e2e`.

These cover what the rest of the suite structurally cannot see. `pnpm check`
proves types, lint and pure functions. `next build` proves the routes compile
and that `/` is still statically prerendered. Neither can tell you whether a
modal traps focus, whether a sticky sidebar sticks, or whether a partner's
page leaks the house brand. Those are the recurring questions, so they get a
real browser.

## Running them

```
pnpm test:e2e             # headless, list reporter
pnpm test:e2e:ui          # the Playwright UI, for writing and debugging
pnpm test:e2e:headed      # watch the browser drive itself
```

The config builds the app and runs `next start` on port 3210. It does NOT use
`next dev`: dev mode compiles on first request (slow enough to time out) and
does not exercise the static/dynamic split, which this project has a hard
requirement about.

Locally the server is reused between runs. After changing app code, stop the
stale server or the tests will assert against the previous build. CI always
builds clean.

## The partner-subdomain caveat, which is the important part

Two mechanisms resolve a tenant, and only one of them works locally.

1. `proxy.ts` injects `x-pv-tenant-slug` and rewrites `/` to `/partner-home`.
   Its matcher host pattern is a **production literal**
   (`...\.primevantagehcm\.com`) because Next requires matcher values to be
   statically analysable at build time, so it cannot read an env var.
2. `getTenant()` falls back to parsing the `Host` header with
   `classifyHost()`, which DOES honour `NEXT_PUBLIC_APEX_HOST`.

So on `acme.localhost:3210` the matcher never fires, but branding still
resolves through the fallback. The practical consequence:

- **`/partner-home` must be requested directly in local tests.** Visiting `/`
  on a partner host locally serves the house page, because the rewrite lives
  in the proxy that did not run. That is a local-only artifact, not a bug.
- `verifies-in-production.md` lists what therefore cannot be proven here.

Do not "fix" this by adding `localhost` to the proxy matcher. The matcher is
asserted against the production apex by `scripts/check-proxy.mts`, and a
second entry would be dead weight in the production bundle to serve a test.

## Seeding a partner

Partner tests skip themselves unless a slug is supplied:

```
PV_E2E_PARTNER_SLUG=acme pnpm test:e2e
```

It must name a tenant that already exists in whichever Supabase project
`.env.local` points at. Nothing here creates one: that would mean a test run
writing to a shared project.

## Signed-in tests

Console coverage needs credentials, and skips without them:

```
PV_E2E_EMAIL=you@example.com PV_E2E_PASSWORD='...' pnpm test:e2e
```

Use a staff account on a non-production project. These tests open dialogs and
read lists; they are written not to mutate, but a password in a shell history
is a password in a shell history.

Never put real credentials in this repo. `.env*` is gitignored and must stay
that way.
