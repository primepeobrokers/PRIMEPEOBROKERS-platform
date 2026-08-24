import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/app/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordCard } from "./update-password-card";

export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false },
};

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

  return (
    <AuthShell>
      <UpdatePasswordCard flow={flow} email={user.email ?? ""} />
    </AuthShell>
  );
}
