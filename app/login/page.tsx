import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth-shell";
import { LoginCard } from "./login-card";
import { Toaster } from "@/app/components/ui/sonner";
import { ArrivalToast } from "@/app/components/arrival-toast";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Prime PEO Brokers broker console.",
  robots: { index: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : "";
  const linkError = searchParams.error === "link";

  return (
    <>
      <AuthShell>
        <LoginCard next={next} linkError={linkError} />
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
