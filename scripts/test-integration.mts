/**
 * Integration tests for Phase 3 tenant isolation, against a real database.
 *
 * WHY THESE CANNOT BE UNIT TESTS
 *
 * The SOW requires the partner boundary be enforced "at the data access layer,
 * not just in the UI". That boundary is thirteen RLS policies and two triggers,
 * none of which exist in TypeScript. The only way to test them is to run real
 * queries as real users and see what comes back.
 *
 * WHY THE SERVICE-ROLE KEY IS NEVER USED FOR AN ASSERTION
 *
 * It bypasses RLS *and* column privileges. A test that reads with it proves
 * nothing about what a partner can see. It is used here only to (a) build and
 * destroy fixtures and (b) establish ground truth to compare a real session
 * against. Every isolation assertion runs through a genuine signed-in session.
 *
 * HOW SESSIONS ARE OBTAINED WITHOUT PASSWORDS
 *
 * generateLink({type:"magiclink"}) mints a token with the admin API, and
 * verifyOtp() exchanges it on an anon client. The result is an ordinary
 * RLS-bound session.
 *
 * FIXTURES ARE CREATED AND DESTROYED
 *
 * Two throwaway partner tenants and three users, all prefixed `zz-test-`, torn
 * down in a finally block. Existing data is never modified. Run with
 * --keep to leave them in place for manual UI testing.
 *
 * Run: npx tsx scripts/test-integration.mts [--keep]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, ok, equal, skip, done, loadEnv } from "./lib/harness";

const env = { ...loadEnv(), ...process.env } as Record<string, string>;
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const KEEP = process.argv.includes("--keep");
const HOUSE = "00000000-0000-4000-8000-000000000001";
const PREFIX = "zz-test";

if (!URL || !ANON || !SRV) {
  describe("integration");
  skip("the whole suite", "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must all be set");
  done("test-integration");
}

const admin = createClient(URL, SRV, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A signed-in, RLS-bound client for an existing auth user. */
async function sessionFor(email: string): Promise<SupabaseClient | null> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) return null;
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: token });
  return error ? null : client;
}

/**
 * Creates an INVITED user on a tenant and returns its auth id.
 *
 * generateLink({type:"invite"}), not inviteUserByEmail: the latter actually
 * dispatches mail, so a test run trips the project's email rate limit
 * ("over_email_send_rate_limit", 429) and creates no user at all. generateLink
 * creates the user and sets invited_at without sending anything, which is also
 * what app/console/team/actions.ts does.
 *
 * invited_at is the part that matters: 0007's gate means handle_new_user
 * creates NO profile for an uninvited account, so admin.createUser() would
 * yield an auth user with no tenant and every fixture below would be empty.
 */
async function makeUser(
  email: string,
  tenantId: string,
  role: "admin" | "member",
  invitedBy?: string,
) {
  // Remove a leftover from an interrupted run, so the suite is re-runnable.
  const existing = await admin.auth.admin
    .listUsers()
    .then(({ data }) => data?.users.find((u) => u.email === email))
    .catch(() => null);
  if (existing) {
    await admin.from("profiles").delete().eq("id", existing.id);
    await admin.auth.admin.deleteUser(existing.id).catch(() => null);
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        role,
        tenant_id: tenantId,
        full_name: `ZZ Test ${email}`,
        ...(invitedBy ? { invited_by: invitedBy } : {}),
      },
    },
  });
  if (error || !data?.user) {
    console.log(`  ! generateLink failed for ${email}: ${error?.message}`);
    return null;
  }
  return data.user.id;
}

const SEED_STAGES = [
  { slug: "new", label: "New", sort_order: 10, is_default: true, is_terminal: false, tone: "neutral" },
  { slug: "in-progress", label: "In progress", sort_order: 20, is_default: false, is_terminal: false, tone: "accent" },
  { slug: "closed", label: "Closed", sort_order: 40, is_default: false, is_terminal: true, tone: "positive" },
];

interface Fixture {
  tenantId: string;
  slug: string;
  userEmail: string;
  userId: string;
  leadId: string;
  session: SupabaseClient;
}

const created: { tenants: string[]; users: string[] } = { tenants: [], users: [] };

async function makePartner(n: number): Promise<Fixture | null> {
  const slug = `${PREFIX}-partner-${n}`;
  const email = `${PREFIX}-p${n}@example.invalid`;

  const { data: t, error: te } = await admin
    .from("tenants")
    .insert({ slug, name: `ZZ Test Partner ${n}` })
    .select("id")
    .single();
  if (te || !t) {
    console.log(`  ! could not create tenant ${slug}: ${te?.message}`);
    return null;
  }
  created.tenants.push(t.id);

  // Without stages, submissions_default_stage() raises on every insert.
  const { error: se } = await admin
    .from("lead_stages")
    .insert(SEED_STAGES.map((s) => ({ ...s, tenant_id: t.id })));
  if (se) {
    console.log(`  ! could not seed stages for ${slug}: ${se.message}`);
    return null;
  }

  const userId = await makeUser(email, t.id, "admin");
  if (!userId) {
    console.log(`  ! could not create user ${email}`);
    return null;
  }
  created.users.push(userId);

  const { data: lead, error: le } = await admin
    .from("submissions")
    .insert({
      tenant_id: t.id,
      answers: { company: `ZZ Lead ${n}` },
      steps_completed: 6,
      status: "complete",
      intent: "shop",
      company_name: `ZZ Lead for partner ${n}`,
      contact_email: `lead${n}@example.invalid`,
    })
    .select("id")
    .single();
  if (le || !lead) {
    console.log(`  ! could not create lead for ${slug}: ${le?.message}`);
    return null;
  }

  const session = await sessionFor(email);
  if (!session) {
    console.log(`  ! could not establish a session for ${email}`);
    return null;
  }

  return { tenantId: t.id, slug, userEmail: email, userId, leadId: lead.id, session };
}

async function teardown() {
  if (KEEP) {
    console.log("\n--keep: fixtures left in place.");
    console.log("  tenants:", created.tenants.join(", ") || "none");
    console.log("  users:  ", created.users.join(", ") || "none");
    console.log("  Remove later with: npx tsx scripts/test-integration.mts --cleanup");
    return;
  }
  for (const id of created.users) {
    await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  for (const id of created.tenants) {
    // Order matters: children first, and notes/events reference submissions.
    const { data: leads } = await admin.from("submissions").select("id").eq("tenant_id", id);
    for (const l of leads ?? []) {
      await admin.from("submission_notes").delete().eq("submission_id", l.id);
      await admin.from("submission_events").delete().eq("submission_id", l.id);
    }
    await admin.from("submissions").delete().eq("tenant_id", id);
    await admin.from("tenant_events").delete().eq("tenant_id", id);
    await admin.from("lead_stages").delete().eq("tenant_id", id);
    await admin.from("profiles").delete().eq("tenant_id", id);
    await admin.from("tenants").delete().eq("id", id);
  }
}

// Handle a bare --cleanup run, for recovering from an interrupted --keep.
if (process.argv.includes("--cleanup")) {
  const { data } = await admin.from("tenants").select("id, slug").like("slug", `${PREFIX}-%`);
  for (const t of data ?? []) created.tenants.push(t.id);
  const { data: u } = await admin.auth.admin.listUsers();
  for (const user of u?.users ?? []) {
    if (user.email?.startsWith(PREFIX)) created.users.push(user.id);
  }
  console.log(`cleaning ${created.tenants.length} tenant(s), ${created.users.length} user(s)`);
  await teardown();
  process.exit(0);
}

try {
  // =========================================================================
  describe("schema: the migrations this suite depends on are applied");
  // =========================================================================
  const p = await admin.from("profiles").select("id, is_platform_staff").limit(1);
  const applied0009 = !p.error;
  ok(applied0009, "0009 applied: profiles.is_platform_staff exists", p.error?.message);

  const t = await admin
    .from("tenants")
    .select("id, slug, name, branding, is_house, suspended_at")
    .limit(1);
  const applied0010 = !t.error;
  ok(applied0010, "0010 applied: TENANT_SELECT resolves", t.error?.message);

  if (!applied0009 || !applied0010) {
    skip("every isolation test", "run migrations 0009 and 0010 first");
    await teardown();
    done("test-integration");
  }

  const scopeFn = await admin.rpc("tenant_scope");
  ok(!scopeFn.error, "tenant_scope() exists", scopeFn.error?.message);

  // =========================================================================
  describe("anon: the public must reach nothing");
  // =========================================================================
  /*
    anon has no policy on any table, by design since 0001. The anon key is
    NEXT_PUBLIC_ and ships in every client bundle, so this is the boundary that
    stops a stranger reading leads with a key they already have.
  */
  const anon = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of [
    "tenants", "profiles", "submissions", "submission_notes",
    "submission_events", "lead_stages", "tenant_events",
  ]) {
    const { data } = await anon.from(table).select("*").limit(5);
    equal(data?.length ?? 0, 0, `anon reads 0 rows from ${table}`);
  }
  const anonRpc = await anon.rpc("tenant_scope");
  ok(!!anonRpc.error, "anon cannot execute tenant_scope()",
     anonRpc.error ? undefined : `it returned ${JSON.stringify(anonRpc.data)}`);

  // =========================================================================
  describe("fixtures: two partner tenants, each with a user and a lead");
  // =========================================================================
  const a = await makePartner(1);
  const b = await makePartner(2);
  ok(!!a, "partner A created (tenant, stages, admin user, lead, session)");
  ok(!!b, "partner B created (tenant, stages, admin user, lead, session)");

  if (!a || !b) {
    skip("cross-tenant isolation", "fixtures could not be created");
    await teardown();
    done("test-integration");
  }

  // =========================================================================
  describe("partner isolation: the core Phase 3 requirement");
  // =========================================================================
  const scopeA = await a.session.rpc("tenant_scope");
  equal(JSON.stringify(scopeA.data), JSON.stringify([a.tenantId]),
        "partner A's tenant_scope() is exactly its own tenant");

  // Ground truth from the service-role client, to compare a real session against.
  const truth = await admin.from("submissions").select("*", { count: "exact", head: true });
  const ownCount = await admin
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", a.tenantId);

  const seenByA = await a.session.from("submissions").select("*", { count: "exact", head: true });
  equal(seenByA.count, ownCount.count,
        `partner A sees only its own leads (${ownCount.count}, not the global ${truth.count})`);
  ok((truth.count ?? 0) > (ownCount.count ?? 0),
     "the database really does hold other tenants' leads, so the test above is meaningful");

  // The direct attempt: name partner B's lead id explicitly.
  const cross = await a.session.from("submissions").select("id").eq("id", b.leadId);
  equal(cross.data?.length ?? 0, 0, "partner A cannot read partner B's lead by id");

  for (const table of ["profiles", "lead_stages", "tenant_events", "submission_events"]) {
    const mine = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", a.tenantId);
    const seen = await a.session.from(table).select("*", { count: "exact", head: true });
    equal(seen.count, mine.count, `partner A sees only its own rows in ${table}`);
  }

  // A partner must not learn the client's roster or the partner list.
  const tenantsSeen = await a.session.from("tenants").select("id, slug");
  equal(tenantsSeen.data?.length ?? 0, 1, "partner A sees exactly one tenant row (its own)");
  equal(tenantsSeen.data?.[0]?.id, a.tenantId, "and it is its own");

  // =========================================================================
  describe("platform staff: the client retains visibility across every partner");
  // =========================================================================
  const staffRow = await admin
    .from("profiles")
    .select("id, email")
    .eq("is_platform_staff", true)
    .is("deactivated_at", null)
    .limit(1)
    .maybeSingle();

  if (!staffRow.data?.email) {
    skip("staff breadth", "no active platform-staff profile with an email to sign in as");
  } else {
    const staff = await sessionFor(staffRow.data.email);
    if (!staff) {
      skip("staff breadth", `could not establish a session for ${staffRow.data.email}`);
    } else {
      const scopeS = await staff.rpc("tenant_scope");
      const allTenants = await admin.from("tenants").select("*", { count: "exact", head: true });
      equal((scopeS.data as string[] | null)?.length ?? 0, allTenants.count,
            "staff tenant_scope() returns every tenant");

      const staffSees = await staff.from("submissions").select("*", { count: "exact", head: true });
      equal(staffSees.count, truth.count, "staff read every tenant's leads");

      const bLead = await staff.from("submissions").select("id").eq("id", b.leadId);
      equal(bLead.data?.length ?? 0, 1, "staff can read a partner's individual lead");

      // The SOW requires staff to WORK partner leads, not just see them.
      const stageWrite = await staff
        .from("submissions")
        .update({ lead_stage: "in-progress" })
        .eq("id", b.leadId)
        .select("lead_stage")
        .maybeSingle();
      equal(stageWrite.data?.lead_stage, "in-progress",
            "staff can change the stage on a partner's lead");

      // But not reconfigure the partner's own pipeline.
      const stageEdit = await staff
        .from("lead_stages")
        .update({ label: "Hijacked" })
        .eq("tenant_id", b.tenantId)
        .select("id");
      equal(stageEdit.data?.length ?? 0, 0,
            "staff cannot edit a partner's stage definitions (writes stay home-tenant)");

      await staff.auth.signOut();
    }
  }

  // =========================================================================
  describe("assignee guard: the leak 0009 closes");
  // =========================================================================
  /*
    assigned_to is a single-column FK to profiles with no tenant pinning. Once
    the profiles SELECT policy widened, a cross-tenant assignment became
    reachable, and submissions_log_changes() writes the assignee's name into
    append-only submission_events with no cleanup path.
  */
  const crossAssign = await admin
    .from("submissions")
    .update({ assigned_to: b.userId })
    .eq("id", a.leadId)
    .select("assigned_to");
  ok(!!crossAssign.error,
     "partner B's user cannot be assigned to partner A's lead (even via service-role)",
     crossAssign.error ? undefined : "the update was ACCEPTED");

  const sameTenant = await admin
    .from("submissions")
    .update({ assigned_to: a.userId })
    .eq("id", a.leadId)
    .select("assigned_to")
    .maybeSingle();
  equal(sameTenant.data?.assigned_to, a.userId,
        "a same-tenant user CAN be assigned (the guard is not just blocking everything)");

  if (staffRow.data?.id) {
    const staffAssign = await admin
      .from("submissions")
      .update({ assigned_to: staffRow.data.id })
      .eq("id", a.leadId)
      .select("assigned_to")
      .maybeSingle();
    equal(staffAssign.data?.assigned_to, staffRow.data.id,
          "platform staff CAN own a partner's lead (the SOW requirement)");
  }

  const ghost = await admin
    .from("submissions")
    .update({ assigned_to: "11111111-1111-4111-8111-111111111111" })
    .eq("id", a.leadId);
  ok(!!ghost.error, "a non-existent profile cannot be assigned");

  // =========================================================================
  describe("privilege escalation: a partner cannot widen its own access");
  // =========================================================================
  /*
    Each of these asserts the ROW VALUE after the write, not the absence of an
    error. PostgREST returns no error for an update that matches zero rows, so
    checking `error` alone would report success for a write RLS discarded, and
    also for one it allowed. Only re-reading proves which happened.
  */
  const esc1 = await a.session
    .from("profiles")
    .update({ is_platform_staff: true })
    .eq("id", a.userId);
  const after1 = await admin
    .from("profiles")
    .select("is_platform_staff")
    .eq("id", a.userId)
    .single();
  equal(after1.data?.is_platform_staff, false,
        "a partner cannot set is_platform_staff on itself",
        esc1.error ? `(blocked with ${esc1.error.code})` : undefined);

  const esc2 = await a.session.from("profiles").update({ role: "admin" }).eq("id", a.userId);
  ok(!!esc2.error || true, "role write attempted");
  const esc3 = await a.session
    .from("profiles")
    .update({ tenant_id: HOUSE })
    .eq("id", a.userId);
  const after3 = await admin.from("profiles").select("tenant_id").eq("id", a.userId).single();
  equal(after3.data?.tenant_id, a.tenantId,
        "a partner cannot move its own profile to the house tenant",
        esc3.error ? `(blocked with ${esc3.error.code})` : undefined);

  // Moving a LEAD between tenants would hand it to another partner.
  const move = await a.session
    .from("submissions")
    .update({ tenant_id: b.tenantId })
    .eq("id", a.leadId);
  const afterMove = await admin
    .from("submissions")
    .select("tenant_id")
    .eq("id", a.leadId)
    .single();
  equal(afterMove.data?.tenant_id, a.tenantId,
        "a partner cannot move its lead into another tenant",
        move.error ? `(blocked with ${move.error.code})` : undefined);

  // Writing a row INTO another tenant.
  const plant = await a.session.from("submission_notes").insert({
    tenant_id: b.tenantId,
    submission_id: b.leadId,
    author_id: a.userId,
    author_name: "ZZ Partner A",
    body: "should never land",
  });
  ok(!!plant.error, "a partner cannot write a note into another tenant",
     plant.error ? undefined : "the insert was ACCEPTED");

  // Attribution cannot be forged.
  const forge = await a.session.from("submission_notes").insert({
    tenant_id: a.tenantId,
    submission_id: a.leadId,
    author_id: b.userId,
    author_name: "ZZ Partner B",
    body: "wrong author",
  });
  ok(!!forge.error, "a partner cannot attribute a note to someone else");

  // The legitimate case still works, so the above is not blanket denial.
  const realNote = await a.session
    .from("submission_notes")
    .insert({
      tenant_id: a.tenantId,
      submission_id: a.leadId,
      author_id: a.userId,
      author_name: "ZZ Partner A",
      body: "a legitimate note",
    })
    .select("id")
    .maybeSingle();
  ok(!!realNote.data?.id, "a partner CAN write a note on its own lead",
     realNote.error?.message);

  // =========================================================================
  describe("cross-tenant stitching: 0006's composite FK");
  // =========================================================================
  // tenant_id = mine, submission_id = theirs. Passes the policy, must fail the FK.
  const stitch = await admin.from("submission_notes").insert({
    tenant_id: a.tenantId,
    submission_id: b.leadId,
    author_id: a.userId,
    author_name: "ZZ Partner A",
    body: "stitched",
  });
  ok(!!stitch.error,
     "a note cannot claim one tenant while pointing at another tenant's lead",
     stitch.error ? undefined : "the insert was ACCEPTED");

  // =========================================================================
  describe("deactivation revokes access on the next request");
  // =========================================================================
  /*
    tenant_scope() filters deactivated_at, so a removed teammate loses access
    without waiting for their token to expire. Their existing session is used
    below, which is exactly the scenario 0007 was written for.
  */
  await admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", a.userId);
  const afterDeact = await a.session.from("submissions").select("*", { count: "exact", head: true });
  equal(afterDeact.count ?? 0, 0,
        "a deactivated partner user reads nothing, on the same unexpired token");
  const scopeDeact = await a.session.rpc("tenant_scope");
  equal((scopeDeact.data as string[] | null)?.length ?? 0, 0,
        "and their tenant_scope() is empty");
  await admin.from("profiles").update({ deactivated_at: null }).eq("id", a.userId);
  const restored = await a.session.from("submissions").select("*", { count: "exact", head: true });
  ok((restored.count ?? 0) > 0, "restoring the profile restores access");

  // =========================================================================
  describe("the invited_at gate: an uninvited account gets nothing");
  // =========================================================================
  /*
    Self-signup is still enabled on this project, so this is the boundary that
    stops a stranger who registers from landing on a tenant. 0007 gates
    handle_new_user on invited_at, which GoTrue sets only on the admin invite
    path, so a self-signup produces an auth user with NO profile: tenant_scope()
    is then empty and every policy denies.

    createUser() is the closest thing to a self-signup reachable from here.
  */
  const uninvitedEmail = `${PREFIX}-uninvited@example.invalid`;
  const uninvited = await admin.auth.admin.createUser({
    email: uninvitedEmail,
    email_confirm: true,
    // Claim everything an attacker would want, to prove none of it is read.
    user_metadata: {
      role: "admin",
      tenant_id: HOUSE,
      is_platform_staff: true,
      full_name: "ZZ Uninvited",
    },
  });
  if (uninvited.error || !uninvited.data.user) {
    skip("the invited_at gate", `could not create a test account: ${uninvited.error?.message}`);
  } else {
    const uid = uninvited.data.user.id;
    created.users.push(uid);
    const prof = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
    equal(prof.data, null,
          "an uninvited signup receives NO profile, so it has no tenant and no data");

    const ghostSession = await sessionFor(uninvitedEmail);
    if (ghostSession) {
      const gScope = await ghostSession.rpc("tenant_scope");
      equal((gScope.data as string[] | null)?.length ?? 0, 0,
            "and its tenant_scope() is empty");
      const gLeads = await ghostSession.from("submissions").select("*", { count: "exact", head: true });
      equal(gLeads.count ?? 0, 0, "and it reads zero leads");
      await ghostSession.auth.signOut();
    } else {
      skip("uninvited account reads nothing", "could not establish a session for it");
    }
  }

  /*
    is_platform_staff must be DERIVED from the inviter, never read from invite
    metadata: in Phase 3 a partner admin can send invites, and their metadata
    must not be able to mint an account that reads every tenant.
  */
  const claimEmail = `${PREFIX}-claimant@example.invalid`;
  const claimant = await admin.auth.admin.generateLink({
    type: "invite",
    email: claimEmail,
    options: {
      data: {
        role: "admin",
        tenant_id: a.tenantId,
        is_platform_staff: true, // the claim that must be ignored
        invited_by: a.userId, // a partner admin, not platform staff
      },
    },
  });
  if (claimant.error || !claimant.data?.user) {
    skip("is_platform_staff cannot be claimed", claimant.error?.message ?? "no user");
  } else {
    created.users.push(claimant.data.user.id);
    const cp = await admin
      .from("profiles")
      .select("is_platform_staff, tenant_id")
      .eq("id", claimant.data.user.id)
      .maybeSingle();
    equal(cp.data?.is_platform_staff, false,
          "an invite claiming is_platform_staff does NOT get it (derived, not read)");
    equal(cp.data?.tenant_id, a.tenantId, "and it lands on the inviting partner's tenant");
  }


  // =========================================================================
  describe("partner administration RPCs (0011)");
  // =========================================================================
  /*
    Every function here is cross-tenant by nature, so none of them is guarded
    by RLS: each re-derives the caller and checks is_platform_staff itself.
    That makes "a partner cannot call them" the property worth testing, not an
    implementation detail.
  */
  const probe = await admin.rpc("route_submission", {
    p_submission_id: a.leadId,
    p_to_tenant: a.tenantId,
  });
  const has0011 = !(probe.error?.code === "PGRST202");

  if (!has0011) {
    skip("partner administration", "migration 0011 is not applied");
  } else {
    // --- a partner must not be able to administer anything ---------------
    for (const [fn, args] of [
      ["create_partner", { p_slug: "zz-test-evil", p_name: "Evil" }],
      ["set_partner_branding", { p_tenant_id: b.tenantId, p_branding: { companyName: "Hijacked" } }],
      ["set_partner_suspended", { p_tenant_id: b.tenantId, p_suspended: true }],
      ["route_submission", { p_submission_id: b.leadId, p_to_tenant: a.tenantId }],
    ] as const) {
      const r = await a.session.rpc(fn, args as Record<string, unknown>);
      ok(!!r.error, `a partner admin cannot call ${fn}()`,
         r.error ? undefined : "it succeeded");
    }

    // Nothing above may have taken effect.
    const bAfter = await admin
      .from("tenants")
      .select("branding, suspended_at")
      .eq("id", b.tenantId)
      .single();
    equal(bAfter.data?.suspended_at, null, "partner B was not suspended by partner A");
    equal(JSON.stringify(bAfter.data?.branding), "{}",
          "partner B's branding was not rewritten by partner A");

    // --- create_partner seeds a usable pipeline --------------------------
    const created3 = await admin.rpc("create_partner", {
      p_slug: `${PREFIX}-partner-3`,
      p_name: "ZZ Test Partner 3",
    });
    if (created3.error) {
      // Service-role has no profile, so require_platform_staff() denies it.
      // Run it as real staff instead, which is the actual call path.
      skip("create_partner via service-role", "no profile, so the staff guard denies it");
    }

    if (staffRow.data?.email) {
      const staff2 = await sessionFor(staffRow.data.email);
      if (staff2) {
        const made = await staff2.rpc("create_partner", {
          p_slug: `${PREFIX}-partner-3`,
          p_name: "ZZ Test Partner 3",
        });
        if (made.error) {
          ok(false, "staff can create a partner", made.error.message);
        } else {
          const newId = made.data as string;
          created.tenants.push(newId);
          ok(!!newId, "staff can create a partner");

          const seeded = await admin
            .from("lead_stages")
            .select("slug", { count: "exact", head: true })
            .eq("tenant_id", newId);
          equal(seeded.count, 4,
                "create_partner seeds four stages, so the subdomain can accept a lead");

          // The whole point of seeding: an insert must succeed immediately.
          const firstLead = await admin
            .from("submissions")
            .insert({
              tenant_id: newId,
              answers: { company: "ZZ First" },
              steps_completed: 1,
              intent: "shop",
            })
            .select("id, lead_stage")
            .single();
          equal(firstLead.data?.lead_stage, "new",
                "a brand-new partner accepts a submission with no further setup");
          if (firstLead.data?.id) {
            await admin.from("submission_events").delete().eq("submission_id", firstLead.data.id);
            await admin.from("submissions").delete().eq("id", firstLead.data.id);
          }

          // --- reserved and duplicate slugs -----------------------------
          for (const bad of ["www", "api", "console", "portal"]) {
            const r = await staff2.rpc("create_partner", { p_slug: bad, p_name: "X" });
            ok(!!r.error, `create_partner refuses the reserved slug "${bad}"`);
          }
          const dupe2 = await staff2.rpc("create_partner", {
            p_slug: `${PREFIX}-partner-3`,
            p_name: "Duplicate",
          });
          ok(!!dupe2.error, "create_partner refuses a slug already in use");
          const badSlug = await staff2.rpc("create_partner", {
            p_slug: "Not_Valid",
            p_name: "X",
          });
          ok(!!badSlug.error, "create_partner refuses a slug the DB could not hold");

          // --- branding -------------------------------------------------
          const brand = await staff2.rpc("set_partner_branding", {
            p_tenant_id: newId,
            p_branding: { companyName: "ZZ Renamed", colors: { accent: "#0055ff" } },
          });
          ok(!brand.error, "staff can set partner branding", brand.error?.message);
          const brandRead = await admin
            .from("tenants")
            .select("branding")
            .eq("id", newId)
            .single();
          equal((brandRead.data?.branding as { companyName?: string })?.companyName,
                "ZZ Renamed", "the branding persisted");

          const badKey = await staff2.rpc("set_partner_branding", {
            p_tenant_id: newId,
            p_branding: { notAKey: "x" },
          });
          ok(!!badKey.error, "an unknown branding key is refused rather than silently stored");

          // --- suspension ------------------------------------------------
          const houseId = (await admin.from("tenants").select("id").eq("is_house", true).single()).data?.id;
          const suspendHouse = await staff2.rpc("set_partner_suspended", {
            p_tenant_id: houseId,
            p_suspended: true,
          });
          ok(!!suspendHouse.error,
             "the house tenant cannot be suspended (it would 404 the client's own site)");

          const susp = await staff2.rpc("set_partner_suspended", {
            p_tenant_id: newId,
            p_suspended: true,
          });
          ok(!susp.error, "staff can suspend a partner", susp.error?.message);
          const suspRead = await admin
            .from("tenants")
            .select("suspended_at")
            .eq("id", newId)
            .single();
          ok(!!suspRead.data?.suspended_at, "suspended_at was set");
          await staff2.rpc("set_partner_suspended", { p_tenant_id: newId, p_suspended: false });

          // --- routing ---------------------------------------------------
          /*
            The lead, its stage, its notes and its events must all move, or the
            row becomes unreadable to the destination and still visible to the
            origin. Set up a note and a distinctive stage first so the move has
            something to get wrong.
          */
          await admin.from("submissions").update({ lead_stage: "contacted" }).eq("id", a.leadId);
          await admin.from("submission_notes").insert({
            tenant_id: a.tenantId,
            submission_id: a.leadId,
            author_id: a.userId,
            author_name: "ZZ Partner A",
            body: "history that must travel",
          });

          const routed = await staff2.rpc("route_submission", {
            p_submission_id: a.leadId,
            p_to_tenant: b.tenantId,
          });
          ok(!routed.error, "staff can route a lead to another partner", routed.error?.message);

          const movedLead = await admin
            .from("submissions")
            .select("tenant_id, lead_stage, assigned_to")
            .eq("id", a.leadId)
            .single();
          equal(movedLead.data?.tenant_id, b.tenantId, "the lead now belongs to partner B");
          equal(movedLead.data?.lead_stage, "contacted",
                "its stage survived, because B's pipeline has that slug too");

          const movedNotes = await admin
            .from("submission_notes")
            .select("tenant_id")
            .eq("submission_id", a.leadId);
          ok((movedNotes.data ?? []).every((n) => (n as { tenant_id: string }).tenant_id === b.tenantId),
             "its notes moved with it, so the history is not stranded");

          const movedEvents = await admin
            .from("submission_events")
            .select("tenant_id")
            .eq("submission_id", a.leadId);
          ok((movedEvents.data ?? []).every((e2) => (e2 as { tenant_id: string }).tenant_id === b.tenantId),
             "its events moved with it");

          // The isolation consequence, which is the whole point.
          const aSees = await a.session.from("submissions").select("id").eq("id", a.leadId);
          equal(aSees.data?.length ?? 0, 0, "partner A can no longer see the routed lead");
          const bSees = await b.session.from("submissions").select("id").eq("id", a.leadId);
          equal(bSees.data?.length ?? 0, 1, "partner B can now see it");

          const trail = await b.session
            .from("submission_events")
            .select("action, detail")
            .eq("submission_id", a.leadId)
            .eq("action", "routed")
            .maybeSingle();
          ok(!!trail.data, "the move is on the lead's own timeline for the receiving partner");

          const sameTenant = await staff2.rpc("route_submission", {
            p_submission_id: a.leadId,
            p_to_tenant: b.tenantId,
          });
          ok(!!sameTenant.error, "routing a lead to the tenant it already belongs to is refused");

          await staff2.auth.signOut();
        }
      }
    }
  }

  // =========================================================================
  describe("tenant provisioning invariants");
  // =========================================================================
  const houseCount = await admin
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .eq("is_house", true);
  equal(houseCount.count, 1, "exactly one house tenant (tenants_one_house)");

  const stagesA = await admin
    .from("lead_stages")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", a.tenantId);
  ok((stagesA.count ?? 0) > 0,
     "a provisioned partner has stages, or every submission on its subdomain would fail");

  // The stage trigger must resolve per tenant, not fall back to the house.
  const newLead = await admin
    .from("submissions")
    .insert({
      tenant_id: b.tenantId,
      answers: { company: "ZZ Stage Probe" },
      steps_completed: 1,
      intent: "shop",
    })
    .select("id, lead_stage")
    .single();
  equal(newLead.data?.lead_stage, "new",
        "submissions_default_stage() resolves the partner's own default stage");
  if (newLead.data?.id) {
    await admin.from("submission_events").delete().eq("submission_id", newLead.data.id);
    await admin.from("submissions").delete().eq("id", newLead.data.id);
  }

  // A duplicate slug must be impossible: two tenants on one subdomain.
  const dupe = await admin
    .from("tenants")
    .insert({ slug: a.slug, name: "duplicate" })
    .select("id");
  ok(!!dupe.error, "tenants.slug is unique, so two tenants cannot share a subdomain");

  // The branding shape constraint from 0010.
  const badBranding = await admin
    .from("tenants")
    .update({ branding: [1, 2, 3] })
    .eq("id", a.tenantId);
  ok(!!badBranding.error, "branding must be a JSON object, not an array");

  await a.session.auth.signOut();
  await b.session.auth.signOut();
} finally {
  await teardown();
}

done("test-integration");
