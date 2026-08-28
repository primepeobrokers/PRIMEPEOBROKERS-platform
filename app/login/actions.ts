"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<{ error: string } | never> {
  const email = String(input.email ?? "").trim();
  const password = String(input.password ?? "");
  if (!email || !password) {
    return {
      error:
        "Enter your email and password. If you have not set one yet, use the invite link.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        "That email and password combination does not match an account. Check both, or use the reset link.",
    };
  }

  const next =
    input.next && input.next.startsWith("/console") ? input.next : "/console";
  redirect(next);
}

export async function sendResetLink(input: {
  email: string;
}): Promise<{ error: string } | { ok: true }> {
  const email = String(input.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { error: "That address is missing an @ or a domain." };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  // Always report success, so the form cannot reveal which emails exist.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/auth/confirm?next=/auth/update-password`,
  });
  return { ok: true };
}

export async function updatePassword(input: {
  password: string;
}): Promise<{ error: string } | never> {
  const password = String(input.password ?? "");
  if (password.length < 12) {
    return {
      error: `That is ${password.length} characters. Twelve or more, and avoid your company name.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This link has expired. Ask for a fresh one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Setting the password failed. Try again." };
  }
  redirect("/console");
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
