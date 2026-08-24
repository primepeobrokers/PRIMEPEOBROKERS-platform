import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth-shell";
import { LoginCard } from "./login-card";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Prime Vantage broker console.",
  robots: { index: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : "";
  const linkError = searchParams.error === "link";

  return (
    <AuthShell>
      <LoginCard next={next} linkError={linkError} />
    </AuthShell>
  );
}
