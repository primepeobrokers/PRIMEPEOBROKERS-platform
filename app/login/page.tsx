import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth-shell";
import { TenantTheme } from "@/app/components/tenant-theme";
import { getTenant } from "@/lib/tenant/resolve";
import { LoginCard } from "./login-card";
import { Toaster } from "@/app/components/ui/sonner";
import { ArrivalToast } from "@/app/components/arrival-toast";

/*
  Generated rather than static, because the root layout's title template
  appends "· Prime PEO Brokers" to every page. On a partner subdomain that put
  the house name in the browser tab of the partner's own sign-in screen, which
  is the one piece of chrome a white-label cannot afford to leak.

  The description is deliberately generic for the same reason. Not indexed
  either way.
*/
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const partner = tenant && !tenant.isHouse ? tenant : null;
  const name = partner
    ? (partner.branding.companyName ?? partner.name)
    : null;

  return {
    // `absolute` bypasses the house template; the house keeps it.
    title: name ? { absolute: `Sign in · ${name}` } : "Sign in",
    description: "Sign in to your account.",
    robots: { index: false },
    ...(name ? { openGraph: { siteName: name, title: `Sign in · ${name}` } } : {}),
  };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : "";
  const linkError = searchParams.error === "link";
  const revoked = searchParams.error === "revoked";

  /*
    getTenant, not requireTenant: an unresolvable host must still be able to
    show a sign-in screen. It degrades to the house brand rather than 404ing
    someone out of the only page that could let them in.
  */
  const tenant = await getTenant();
  const authTenant = tenant
    ? { isHouse: tenant.isHouse, name: tenant.name, branding: tenant.branding }
    : null;

  return (
    <>
      {tenant && <TenantTheme branding={tenant.branding} />}
      <AuthShell tenant={authTenant}>
        <LoginCard
          next={next}
          linkError={linkError}
          revoked={revoked}
          partnerName={
            authTenant && !authTenant.isHouse
              ? (authTenant.branding.companyName ?? authTenant.name)
              : null
          }
        />
      </AuthShell>
      {/*
        Outside AuthShell on purpose: as children these mounted inside the login
        card, so the toast was clipped into a 452px bordered panel instead of
        floating above the page.
      */}
      {/*
        Bottom-left here, not the app default: this page's right half is the
        dark panel, and a toast landing on it collides with the access-log
        block. The left column is white space below the card.
      */}
      <Toaster position="bottom-left" />
      {/* Confirms the sign-out that redirected here; the console is gone by now. */}
      <ArrivalToast
        param="signedout"
        title="Signed out"
        description="Your session on this device is closed."
      />
    </>
  );
}
