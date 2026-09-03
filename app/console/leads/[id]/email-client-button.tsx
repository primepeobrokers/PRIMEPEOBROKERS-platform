"use client";

import { CheckIcon, ChevronDownIcon, CopyIcon, MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

/**
 * "Email the client", without the mailto dead end.
 *
 * This used to be a bare mailto: link. On a machine with no default mail app
 * configured (which describes most people who live in Gmail in a browser
 * tab), clicking a mailto does nothing at all: no error, no new window, just
 * a button that appears broken. The person it failed for is exactly the
 * office manager this console is built for.
 *
 * So the button opens a menu with the three ways people actually send mail:
 * Gmail in a tab, whatever the machine's mail app is, and copying the
 * address for pasting anywhere else. Every choice produces a visible result.
 */
export function EmailClientButton({
  email,
  subject,
}: {
  email: string;
  subject: string;
}) {
  const [copied, setCopied] = useState(false);

  const gmailUrl =
    "https://mail.google.com/mail/?view=cm&fm=1" +
    `&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
  const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg">
          Email the client
          <ChevronDownIcon className="size-4 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[230px]">
        <DropdownMenuItem asChild>
          {/*
            A real link, so it opens a compose tab even when popups are
            restricted for window.open. Gmail ignores the referrer and just
            prefills the compose form.
          */}
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
            <MailIcon className="size-4" />
            Compose in Gmail
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={mailtoUrl}>
            <MailIcon className="size-4" />
            Open your mail app
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(email);
              setCopied(true);
              toast.success("Address copied", { description: email });
              setTimeout(() => setCopied(false), 2200);
            } catch {
              // Same failure mode copy-link.tsx handles: surface the value
              // so it can be copied by hand instead of failing silently.
              toast.error("Could not reach the clipboard", {
                description: email,
                duration: 10000,
              });
            }
          }}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
          Copy address
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
