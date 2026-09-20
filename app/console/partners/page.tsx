import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseBranding } from "@/lib/tenant/branding";
import { APEX_HOST } from "@/lib/tenant/host";
import { CreatePartnerDialog } from "./create-partner-dialog";
import { PartnersTable, type PartnerMember, type PartnerRow } from "./partners-table";

export const metadata: Metadata = {
  title: "Partners",
  robots: { index: false },
};

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  branding: unknown;
  is_house: boolean | null;
  suspended_at: string | null;
}

/**
 * Partner administration: the SOW's "admin controls for the client to add a
 * partner, configure branding, and issue partner logins without developer
 * involvement".
 *
 * requireStaff, not requireAdminPage: managing partners is a platform-level
 * act, and a partner tenant has its own admins who must never reach this
 * screen. It 404s rather than redirecting, so someone who guesses the URL does
 * not learn the route exists.
 *
 * Reads go through the session client, so RLS scopes them: tenant_scope()
 * returns every tenant for platform staff, which is what makes this list
 * possible at all, and returns one tenant for anyone else, which is what makes
 * the route useless to them even if the guard were removed.
 */
export default async function PartnersPage() {
  await requireStaff("/console/partners");
  const supabase = await createClient();

  const [{ data: tenantRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, slug, name, branding, is_house, suspended_at")
      .order("name", { ascending: true }),
    // The roster itself, not just a count: each partner row lists who has
    // a login so the client can resend or revoke without asking us.
    supabase
      .from("profiles")
      .select("id, tenant_id, full_name, email, deactivated_at")
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  const tenants = (tenantRows ?? []) as TenantRecord[];

  /*
    Lead counts as counts, not as rows.

    This used to be `select("tenant_id")` with no limit, tallied in JS. It
    avoided an N+1, which the old comment was right about, but it paid for
    that by transferring EVERY submission row in scope on every render of
    this screen: at ten partners averaging 5,000 leads that is 50,000 rows
    crossing the wire to produce ten integers, and it grows forever.

    `head: true` with an exact count returns no rows at all, just the count in
    a Content-Range header, and `submissions_tenant_created_idx` (0001) covers
    the tenant_id predicate. One request per partner, but each is an index
    count of a few bytes rather than a full table read, and the roster is
    single digits to low tens. Promise.all keeps them concurrent.

    The same `count: "exact", head: true` pattern is already used on the main
    console list (app/console/page.tsx:126).
  */
  const partnerTenants = tenants.filter((t) => t.is_house !== true);
  const counts = await Promise.all(
    partnerTenants.map((t) =>
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id)
        .then(({ count }) => [t.id, count ?? 0] as const),
    ),
  );
  const leadsByTenant = new Map<string, number>(counts);

  const membersByTenant = new Map<string, PartnerMember[]>();
  for (const row of profileRows ?? []) {
    const r = row as {
      id: string;
      tenant_id: string;
      full_name: string | null;
      email: string | null;
      deactivated_at: string | null;
    };
    const list = membersByTenant.get(r.tenant_id) ?? [];
    list.push({
      id: r.id,
      name: r.full_name,
      email: r.email,
      deactivatedAt: r.deactivated_at,
    });
    membersByTenant.set(r.tenant_id, list);
  }

  // The house tenant is managed through /console/team, and it must never be
  // suspendable or re-brandable from here.
  const partners: PartnerRow[] = tenants
    .filter((t) => t.is_house !== true)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      branding: parseBranding(t.branding, t.name),
      suspendedAt: t.suspended_at,
      leadCount: leadsByTenant.get(t.id) ?? 0,
      members: membersByTenant.get(t.id) ?? [],
    }));

  const apexHost = APEX_HOST;

  return (
    <main className="mx-auto max-w-[1100px] px-7 py-9 max-sm:px-[18px] max-sm:py-6">
      {/*
        The create action sits in the header as a button, not as a form
        occupying the top of the page. Creating a partner is rare and
        permanent; reading the list is the daily job, so the list starts at
        the top of the screen and the rare task is one click away.
      */}
      <header className="mb-7 flex items-start justify-between gap-6 max-sm:flex-col max-sm:gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-.02em] text-ink">
            Partners
          </h1>
          <p className="mt-1.5 max-w-[68ch] text-[14px] text-ink-muted">
            Each partner gets a branded portal on their own subdomain showing
            only their own leads. Every submission still reaches your console,
            and your team works all of them.
          </p>
        </div>
        <div className="shrink-0">
          <CreatePartnerDialog apexHost={apexHost} />
        </div>
      </header>

      <section>
        <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
          {partners.length} partner{partners.length === 1 ? "" : "s"}
        </h2>
        <PartnersTable partners={partners} apexHost={apexHost} />
      </section>
    </main>
  );
}
