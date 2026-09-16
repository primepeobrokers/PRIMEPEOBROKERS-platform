import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant/resolve";
import { TenantTheme } from "@/app/components/tenant-theme";
import { TalkForm } from "./talk-form";

/**
 * "Talk to a broker first." The homepage used to point this at a mailto:
 * link, which does nothing on a machine with no mail app configured, so the
 * button read as broken. This is the same promise as a real page: five
 * fields, one submit, and the request lands in the console as a lead.
 *
 * Tenant-aware like the discovery page, for the same reason: a partner's
 * visitor should see the partner's mark here too.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const name =
    tenant && !tenant.isHouse ? (tenant.branding.companyName ?? tenant.name) : null;
  return {
    title: name ? `Talk to a broker · ${name}` : "Talk to a broker",
    description:
      "Leave a name, a work email, and what is on your mind. A licensed broker calls you back within one business day.",
    alternates: { canonical: "/talk" },
  };
}

export default async function TalkPage() {
  const tenant = await getTenant();
  return (
    <>
      {tenant && <TenantTheme branding={tenant.branding} />}
      <TalkForm
        tenant={
          tenant
            ? { isHouse: tenant.isHouse, name: tenant.name, branding: tenant.branding }
            : null
        }
      />
    </>
  );
}
