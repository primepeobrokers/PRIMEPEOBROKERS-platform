import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/app/components/logo";
import { signOut } from "@/app/login/actions";
import { Toaster } from "@/app/components/ui/sonner";
import { ConsoleNavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";
import { ArrivalToast } from "@/app/components/arrival-toast";

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false },
};

export default async function ConsoleLayout({
  children,
}: LayoutProps<"/console">) {
  /*
    requireUser also rejects a deactivated teammate, whose profile row still
    exists so their name keeps resolving in old notes and events. Removal
    therefore takes effect on the next request rather than at token expiry.
  */
  const ctx = await requireUser("/console");

  const name = ctx.fullName || ctx.email || "";
  const firstName = (ctx.fullName || "").trim().split(/\s+/)[0] || "";
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
              <ConsoleNavLink href="/console">Leads</ConsoleNavLink>
              {/*
                Team and Providers are both unbuilt, so they stay non-links
                like Providers always was. An earlier revision made Team a real
                Link for admins, which 404'd: the route does not exist yet.
                Restore the Link only in the commit that adds /console/team.

                When it does land it should be admin-only and simply absent for
                members, not disabled: a greyed-out admin link advertises a
                feature they cannot have and turns into a support question.
              */}
              {ctx.role === "admin" && (
                <span
                  className="cursor-default text-ink-faint"
                  title="Arrives later in Phase 2"
                >
                  Team
                </span>
              )}
              <span
                className="cursor-default text-ink-faint"
                title="Arrives in a later phase"
              >
                Providers
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3.5">
            <SignOutButton action={signOut} />
            <div
              title={name}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-dark-line font-mono text-[11px] text-dark-ink-soft"
            >
              {initials}
            </div>
          </div>
        </div>
      </header>
      {children}
      <Toaster />
      <ArrivalToast
        param="welcome"
        title={firstName ? `Signed in as ${firstName}` : "Signed in"}
        description="Leads are scoped to your team."
      />
    </div>
  );
}
