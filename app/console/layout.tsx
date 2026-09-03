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
          <div className="flex min-w-0 items-center gap-[26px] max-sm:gap-4">
            <div className="flex shrink-0 items-center gap-[11px]">
              <Logo size={26} variant="inverted" />
              <span className="border-l border-dark-line pl-[11px] font-mono text-[10.5px] uppercase tracking-[.12em] text-dark-ink-muted max-sm:hidden">
                Console
              </span>
            </div>
            {/*
              Visible at every width. This nav used to be max-sm:hidden with
              nothing replacing it, which left /console/team unreachable on a
              phone: it is linked from here and nowhere else. The "Console"
              wordmark drops instead, since the logo already says that.
            */}
            <nav aria-label="Sections" className="flex min-w-0 gap-5 text-[13.5px] max-sm:gap-4 max-sm:text-[13px]">
              <ConsoleNavLink href="/console">Leads</ConsoleNavLink>
              {/*
                Omitted for members rather than disabled: a greyed-out admin
                link advertises a feature they cannot have and turns into a
                support question. The route itself returns 404 for a member,
                so guessing the URL reveals nothing either.
              */}
              {ctx.role === "admin" && (
                <ConsoleNavLink href="/console/team">Team</ConsoleNavLink>
              )}
              {/*
                A disabled button rather than a <span title>: title text never
                reaches a keyboard or touch user, so the item read as
                mysteriously dead. aria-disabled keeps it focusable so the
                explanation is actually reachable.
              */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-describedby="providers-note"
                className="cursor-default border-b border-transparent pb-0.5 text-dark-ink-muted/60 max-sm:hidden"
              >
                Providers
              </button>
              <span id="providers-note" className="sr-only">
                Providers arrives in a later phase.
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
