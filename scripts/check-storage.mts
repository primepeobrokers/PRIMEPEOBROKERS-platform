/**
 * The tenant-logos bucket, which nothing in this repository creates.
 *
 * WHY THIS EXISTS
 *
 * Partner logo upload writes to a Storage bucket called `tenant-logos`
 * (app/console/partners/actions.ts). That bucket was created by hand in the
 * Supabase dashboard. No migration makes it, `supabase/config.toml` still has
 * the `[storage.buckets]` example commented out, and nothing else in the repo
 * would recreate it.
 *
 * So a fresh Supabase project, a restored backup, or a second environment
 * gets a partner screen where upload fails with a bucket-not-found error from
 * deep inside the storage client, and nothing in the codebase explains why.
 * This turns that into one sentence.
 *
 * It also checks the settings the upload path ASSUMES rather than enforces:
 *
 *   - public, because an unauthenticated portal header renders the image
 *   - no size cap, because a partner's logo is whatever file they send
 *   - images only ("image/*"), so a document cannot be published from it
 *
 * Needs credentials, so it is NOT part of `pnpm check`. It skips cleanly
 * without them, exactly like the integration suite.
 */
import { createClient } from "@supabase/supabase-js";

import { describe, ok, equal, skip, done, loadEnv } from "./lib/harness";

const env = { ...loadEnv(), ...process.env } as Record<string, string>;
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;

/** Kept in step with LOGO_BUCKET in the partners actions. */
const BUCKET = "tenant-logos";
const WANT_MIME = ["image/*"];

describe("storage: the tenant-logos bucket");

if (!URL || !SRV) {
  skip(
    "the whole suite",
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set",
  );
  done("check-storage");
}

const admin = createClient(URL, SRV, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: bucket, error } = await admin.storage.getBucket(BUCKET);

if (error || !bucket) {
  ok(
    false,
    `the ${BUCKET} bucket exists`,
    `Partner logo upload writes here and will fail without it. Create it in ` +
      `the Supabase dashboard: Storage, New bucket, name "${BUCKET}", public ` +
      `on, no file size limit, allowed MIME types ` +
      `${WANT_MIME.join(", ")}. Reported: ${error?.message ?? "not found"}`,
  );
  done("check-storage");
}

ok(true, `the ${BUCKET} bucket exists`);

/*
  Public, because TenantMark renders the logo with a plain <img> resolved
  through logoUrl(), on a portal header and now a partner's public marketing
  page. A private bucket returns 400 for every one of those requests.
*/
equal(bucket.public, true, `${BUCKET} is public`);

/*
  No size cap, by client decision (29 Oct 2026): a partner's logo is whatever
  file they send. The browser uploads straight to Storage through a signed
  URL, so no server request limit applies either. Only the Supabase project's
  global upload limit remains, and that is a dashboard setting, not this one.
*/
equal(bucket.file_size_limit ?? null, null, `${BUCKET} has no file size limit`);

/*
  Images only, as "image/*". Any image format is accepted, SVG included, but
  not text/html or other documents: the bucket is public, so anything stored
  here is downloadable by anyone with the link.
*/
const mime = bucket.allowed_mime_types;
equal(
  JSON.stringify(mime ?? null),
  JSON.stringify(WANT_MIME),
  `${BUCKET} allows images only (${WANT_MIME.join(", ")})`,
);

done("check-storage");
