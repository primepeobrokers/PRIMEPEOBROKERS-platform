"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A console nav item that knows whether it is the current section.
 *
 * The underline used to be hardcoded on Leads, which was correct while it was
 * the only real destination. With a second one it has to follow the route, so
 * this is a client component purely to read the pathname.
 *
 * /console matches exactly, because every other console route is nested under
 * it and would otherwise light up Leads as well as itself.
 */
export function ConsoleNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/console" ? pathname === "/console" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "pb-0.5 transition-colors duration-150",
        active
          ? "border-b border-dark-ink text-dark-ink"
          : "border-b border-transparent text-dark-ink-muted hover:text-dark-ink",
      )}
    >
      {children}
    </Link>
  );
}
