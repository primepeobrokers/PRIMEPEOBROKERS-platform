# What this suite cannot prove locally

Honest limits, so nobody reads a green run as more than it is.

## 1. The proxy rewrite of `/` on a partner host

`proxy.ts`'s matcher host pattern is the production literal
`(?<pvslug>[a-z0-9-]{2,63})\.primevantagehcm\.com`. Next requires matcher
values to be statically analysable at build time, so it cannot interpolate
`NEXT_PUBLIC_APEX_HOST`. On `acme.localhost:3210` the pattern does not match,
the proxy never runs, and `/` serves the house page.

Locally covered instead: `/partner-home` is requested directly, which tests
the page that the rewrite targets. `scripts/check-proxy.mts` asserts the
matcher literal agrees with the production apex.

**Verify on production:** `https://<slug>.primevantagehcm.com/` shows the
partner marketing page, not a sign-in screen and not the house page.

## 2. Anything requiring a tenant header

Same cause. Locally `getTenant()` falls back to parsing `Host`, which is
enough for branding. Header injection and the `x-pv-tenant-slug` spoofing
defence are production-only.

## 3. Email

No test sends mail. Invite delivery, resend, and the white-label `From`
and reply-to headers are all unverified here, by choice: asserting them means
either a live send or a mock so thorough it proves nothing.

**Verify by hand:** add a user, resend a link, confirm the mail arrives and
is branded as the partner.

## 4. DNS, TLS and the wildcard certificate

A wildcard cert covers one label (`*.primevantagehcm.com`). `a.b.acme...`
is not covered, which is why `classifyHost` rejects it.

## 5. Real data volume

Tests run against whatever the dev project holds. The CSV export paging
(`EXPORT_BATCH = 500`) and the portal's `PAGE_CAP = 250` only behave
differently past those thresholds.

**Verify on production:** export a tenant with more than 1,000 leads and
count the rows.
