import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/app/components/auth-shell";
import { TenantTheme } from "@/app/components/tenant-theme";
import { createClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant/resolve";
import { UpdatePasswordCard } from "./update-password-card";

// Same reason as the sign-in page: the root layout's title template would
// otherwise put "· Prime PEO Brokers" in the tab of a partner's own screen.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const partner = tenant && !tenant.isHouse ? tenant : null;
  const name = partner ? (partner.branding.companyName ?? partner.name) : null;

  return {
    title: name
      ? { absolute: `Set your password · ${name}` }
      : "Set your password",
    robots: { index: false },
  };
}

export default async function UpdatePasswordPage(
  props: PageProps<"/auth/update-password">,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");

  const searchParams = await props.searchParams;
  const flow = searchParams.flow === "invite" ? "invite" : "recovery";

  // This is the last screen of the invite journey, on the partner's own host,
  // so it carries their brand like the sign-in screen before it.
  const tenant = await getTenant();

  return (
    <>
      {tenant && <TenantTheme branding={tenant.branding} />}
      <AuthShell
        tenant={
          tenant
            ? { isHouse: tenant.isHouse, name: tenant.name, branding: tenant.branding }
            : null
        }
      >
        <UpdatePasswordCard
          flow={flow}
          email={user.email ?? ""}
          brandName={
            tenant && !tenant.isHouse
              ? (tenant.branding.companyName ?? tenant.name)
              : undefined
          }
        />
      </AuthShell>
    </>
  );
}
