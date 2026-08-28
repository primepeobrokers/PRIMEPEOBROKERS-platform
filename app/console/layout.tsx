import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/app/components/logo";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false },
};

export default async function ConsoleLayout({
  children,
}: LayoutProps<"/console">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/console");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.full_name || user.email || "";
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase())
      .join("") || "PV";

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-dark text-dark-ink">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-6 px-7 max-sm:px-[18px]">
          <div className="flex items-center gap-[26px]">
            <div className="flex items-center gap-[11px]">
              <Logo size={26} variant="inverted" />
              <span className="border-l border-dark-line pl-[11px] font-mono text-[10.5px] uppercase tracking-[.12em] text-dark-ink-muted">
                Console
              </span>
            </div>
            <nav aria-label="Sections" className="flex gap-5 text-[13.5px] max-sm:hidden">
              <Link
                href="/console"
                className="border-b border-dark-ink pb-0.5 text-dark-ink"
              >
                Leads
              </Link>
              <span className="cursor-default text-ink-faint" title="Arrives in Phase 2">
                Providers
              </span>
              <span className="cursor-default text-ink-faint" title="Arrives in Phase 2">
                Team
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3.5">
            <form action={signOut}>
              <button
                type="submit"
                className="cursor-pointer text-[12.5px] text-ink-faint transition-colors duration-150 hover:text-dark-ink"
              >
                Sign out
              </button>
            </form>
            <div
              title={name}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[2px] bg-dark-line font-mono text-[11px] text-dark-ink-soft"
            >
              {initials}
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
