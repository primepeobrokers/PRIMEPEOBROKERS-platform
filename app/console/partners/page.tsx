import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseBranding } from "@/lib/tenant/branding";
import { APEX_HOST } from "@/lib/tenant/host";
import { CreatePartnerCard } from "./create-partner-card";
import { PartnersTable, type PartnerRow } from "./partners-table";

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

  const [{ data: tenantRows }, { data: leadRows }, { data: profileRows }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("id, slug, name, branding, is_house, suspended_at")
        .order("name", { ascending: true }),
      // Counted in one pass rather than a query per partner: the roster is
      // single digits to low tens, so N+1 here would be gratuitous.
      supabase.from("submissions").select("tenant_id"),
      supabase.from("profiles").select("tenant_id, deactivated_at"),
    ]);

  const tenants = (tenantRows ?? []) as TenantRecord[];

  const leadsByTenant = new Map<string, number>();
  for (const row of leadRows ?? []) {
    const id = (row as { tenant_id: string }).tenant_id;
    leadsByTenant.set(id, (leadsByTenant.get(id) ?? 0) + 1);
  }

  const usersByTenant = new Map<string, number>();
  for (const row of profileRows ?? []) {
    const r = row as { tenant_id: string; deactivated_at: string | null };
    if (r.deactivated_at) continue;
    usersByTenant.set(r.tenant_id, (usersByTenant.get(r.tenant_id) ?? 0) + 1);
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
      userCount: usersByTenant.get(t.id) ?? 0,
    }));

  const apexHost = APEX_HOST;

  return (
    <main className="mx-auto max-w-[1100px] px-7 py-9 max-sm:px-[18px] max-sm:py-6">
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-semibold tracking-[-.02em] text-ink">
          Partners
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[14px] text-ink-muted">
          Each partner gets a branded portal on their own subdomain showing
          only their own leads. Every submission still reaches your console, and
          your team works all of them.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <CreatePartnerCard apexHost={apexHost} />

        <section>
          <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
            {partners.length} partner{partners.length === 1 ? "" : "s"}
          </h2>
          <PartnersTable partners={partners} apexHost={apexHost} />
        </section>
      </div>
    </main>
  );
}
