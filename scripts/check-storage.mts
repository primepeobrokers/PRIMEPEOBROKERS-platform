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
 *   - a size cap, because the action checks 200KB client-side and a bucket
 *     with no cap makes that the only limit
 *   - PNG and WebP only. SVG is excluded deliberately: one served from our own
 *     origin can carry <script>, and next/image passes SVG through untouched.
 *
 * Needs credentials, so it is NOT part of `pnpm check`. It skips cleanly
 * without them, exactly like the integration suite.
 */
import { createClient } from "@supabase/supabase-js";

import { describe, ok, equal, skip, done, loadEnv } from "./lib/harness";

const env = { ...loadEnv(), ...process.env } as Record<string, string>;
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;

/** Kept in step with LOGO_BUCKET / LOGO_MAX_BYTES in the partners actions. */
const BUCKET = "tenant-logos";
const MAX_BYTES = 200 * 1024;
const WANT_MIME = ["image/png", "image/webp"];

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
      `on, file size limit ${MAX_BYTES / 1024}KB, allowed MIME types ` +
      `${WANT_MIME.join(" and ")}. Reported: ${error?.message ?? "not found"}`,
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
  A cap on the bucket, not only in the action. uploadPartnerLogo checks the
  size before uploading, but that check runs in our code: the bucket limit is
  what holds if anything ever writes here by another path.
*/
ok(
  bucket.file_size_limit !== null && bucket.file_size_limit !== undefined,
  `${BUCKET} has a file size limit`,
  "Unlimited uploads into a public bucket. Set it to 200KB.",
);

if (bucket.file_size_limit) {
  ok(
    bucket.file_size_limit <= MAX_BYTES,
    `${BUCKET} caps uploads at ${MAX_BYTES / 1024}KB or less`,
    `Bucket allows ${Math.round(bucket.file_size_limit / 1024)}KB, while the ` +
      `upload action rejects anything over ${MAX_BYTES / 1024}KB.`,
  );
}

/*
  The MIME allowlist is a security boundary, not a convenience. An SVG served
  from our own origin can carry <script>, and next/image passes SVG through
  untouched unless dangerouslyAllowSVG is set. The upload path also sniffs
  magic bytes (lib/tenant/image-size.ts), so this is the second lock.
*/
const mime = bucket.allowed_mime_types;
ok(
  Array.isArray(mime) && mime.length > 0,
  `${BUCKET} restricts MIME types`,
  `Any file type may be uploaded. Set the allowlist to ${WANT_MIME.join(", ")}.`,
);

if (Array.isArray(mime)) {
  const lower = mime.map((m) => m.toLowerCase());
  for (const bad of ["image/svg+xml", "text/html"]) {
    ok(!lower.includes(bad), `${BUCKET} does not allow ${bad}`);
  }
  for (const want of WANT_MIME) {
    ok(
      lower.includes(want),
      `${BUCKET} allows ${want}`,
      "Partner logos are uploaded as PNG or WebP; excluding one breaks upload.",
    );
  }
}

done("check-storage");
