/**
 * Provisions a Phase 3 partner tenant.
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION
 *
 * Partners are runtime data, like teammates and stages. A migration per
 * partner would mean a deploy per partner, which is exactly what the SOW rules
 * out ("add a partner ... without developer involvement"). This script is the
 * interim tool until the admin screen exists; the admin screen will do the
 * same three steps through the same service-role path.
 *
 * WHY SEEDING STAGES IS NOT OPTIONAL
 *
 * submissions_default_stage() (migration 0005) raises
 *
 *     Tenant % has no lead stages configured; cannot accept a submission.
 *
 * when a tenant has no stages, and the 0005 seed is hardcoded to the founding
 * tenant's UUID. So a tenant created without stages REJECTS EVERY SUBMISSION
 * on its subdomain: the partner's whole reason for existing, failing closed,
 * with an error the visitor cannot act on. The stage insert below is the
 * difference between a working partner and a silently broken one.
 *
 * Usage:
 *   npx tsx scripts/provision-tenant.mts --slug acme --name "Acme Brokers"
 *   npx tsx scripts/provision-tenant.mts --slug acme --name "Acme" --invite ops@acme.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

/** Mirrors the tenants.slug constraint in migration 0001. */
const SLUG_RE = /^[a-z0-9-]{2,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * The four SOW stages, identical to the 0005 seed for the founding tenant so
 * that every tenant starts from the same pipeline. `new` is the default and,
 * because submissions.lead_stage defaults to 'new' in 0001, is the slug that
 * must always exist.
 */
const SEED_STAGES = [
  { slug: "new", label: "New", sort_order: 10, is_default: true, is_terminal: false, tone: "neutral" },
  { slug: "in-progress", label: "In progress", sort_order: 20, is_default: false, is_terminal: false, tone: "accent" },
  { slug: "contacted", label: "Contacted", sort_order: 30, is_default: false, is_terminal: false, tone: "warning" },
  { slug: "closed", label: "Closed", sort_order: 40, is_default: false, is_terminal: true, tone: "positive" },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const slug = (arg("slug") ?? "").trim().toLowerCase();
  const name = (arg("name") ?? "").trim();
  const invite = (arg("invite") ?? "").trim().toLowerCase();

  if (!SLUG_RE.test(slug)) {
    die(`--slug must match ${SLUG_RE} (it becomes the subdomain and a DNS label).`);
  }
  if (!name || name.length > 200) die("--name is required (the partner's company name).");
  if (invite && !EMAIL_RE.test(invite)) die("--invite is not a valid email address.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. The tenant. Reuse an existing row rather than failing, so a partial
  //    run (tenant created, stages not) can be finished by re-running.
  const { data: existing } = await db
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  let tenantId: string;
  if (existing) {
    tenantId = existing.id;
    console.log(`  tenant     ${slug} already exists (${tenantId})`);
  } else {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug, name })
      .select("id")
      .single();
    if (error || !data) die(`could not create the tenant: ${error?.message}`);
    tenantId = data.id;
    console.log(`  tenant     ${slug} created (${tenantId})`);
  }

  // 2. The pipeline. on conflict do nothing, matching 0005, so a re-run never
  //    resets labels or ordering the client has since tuned.
  const { error: stageErr } = await db
    .from("lead_stages")
    .upsert(
      SEED_STAGES.map((s) => ({ ...s, tenant_id: tenantId })),
      { onConflict: "tenant_id,slug", ignoreDuplicates: true },
    );
  if (stageErr) die(`could not seed stages: ${stageErr.message}`);

  const { count } = await db
    .from("lead_stages")
    .select("slug", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  console.log(`  stages     ${count ?? 0} configured`);

  // Fail loudly rather than leaving a tenant that rejects every submission.
  if (!count) die("stages were not seeded; this tenant would reject every submission.");

  // 3. The first partner user, if asked for. handle_new_user reads tenant_id
  //    from this metadata (0007) and derives is_platform_staff as false,
  //    because the tenant is not the founding one (0009).
  if (invite) {
    const apex = process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000";
    const scheme = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://")
      ? "https"
      : "http";
    const redirectTo = `${scheme}://${slug}.${apex}/auth/confirm?type=invite`;

    const { data, error } = await db.auth.admin.generateLink({
      type: "invite",
      email: invite,
      options: {
        // role 'admin' so the partner can manage their own portal users
        // later; they still cannot touch another tenant, and is_platform_staff
        // stays false, so this grants nothing outside their own tenant.
        data: { role: "admin", tenant_id: tenantId },
        redirectTo,
      },
    });
    if (error || !data?.properties?.action_link) {
      die(`could not create the invite: ${error?.message}`);
    }
    console.log(`  invite     ${invite}`);
    console.log(`\n  Send them this link (it is not emailed by this script):\n  ${data.properties.action_link}`);
  }

  console.log(`\n  Portal: ${slug}.${process.env.NEXT_PUBLIC_APEX_HOST ?? "localhost:3000"}\n`);
  console.log("  Remaining, and outside this script:");
  console.log("    * the subdomain must resolve (wildcard DNS) and be covered by the TLS cert");
  console.log("    * the redirect URL must be allowlisted in Supabase Auth");
  console.log("    * branding (logo, palette) is set on tenants.branding\n");
}

main().catch((e) => die(String(e)));
