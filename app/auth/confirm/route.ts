import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands Supabase auth email links (invite, password recovery). Verifies the
 * one-time token, which establishes a session, then forwards to the
 * set-password screen or the console.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const next =
    nextParam && nextParam.startsWith("/") ? nextParam : "/console";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      if (type === "invite" || type === "recovery") {
        redirect(`/auth/update-password?flow=${type}`);
      }
      redirect(next);
    }
  }

  /*
    A one-time token is spent the first time it is verified, so a refresh, a
    second click, or a mail client that pre-fetches the link all arrive here
    with a token that no longer verifies. If that first click already
    established the session, send them on rather than to an error that reads
    as "your invite expired".
  */
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    if (type === "invite" || type === "recovery") {
      redirect(`/auth/update-password?flow=${type}`);
    }
    redirect(next);
  }

  redirect("/login?error=link");
}
