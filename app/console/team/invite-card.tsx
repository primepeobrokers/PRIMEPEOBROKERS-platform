"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { inviteTeammate } from "./actions";

/**
 * Invite a teammate.
 *
 * Same shape as the auth cards: local state per field, useTransition for
 * pending, a plain object into a typed action, and a discriminated result
 * rendered inline. No form element, no FormData.
 */
export function InviteCard() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending || !email.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await inviteTeammate({ email, fullName, role });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEmail("");
      setFullName("");
      setRole("member");
      toast.success(result.message ?? "Invite sent.");
    });
  };

  return (
    <Card className="gap-0 rounded-md py-row-x">
      <CardContent className="px-row-x">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Invite a teammate
        </div>

        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label htmlFor="invite-email" className="block text-[13px] text-ink-muted">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="name@company.com"
              aria-invalid={error ? true : undefined}
              className="mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="invite-name" className="block text-[13px] text-ink-muted">
              Full name <span className="text-ink-faint">(optional)</span>
            </label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Dana Whitfield"
              className="mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-[13px] text-ink-muted">
              Role
            </label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v === "admin" ? "admin" : "member")}
            >
              <SelectTrigger id="invite-role" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Team member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-1.5 text-[12.5px] leading-normal text-ink-muted">
              {role === "admin"
                ? "Admins can invite, remove and change roles, and edit the pipeline."
                : "Team members work leads. They cannot manage the team."}
            </div>
          </div>

          {error && (
            <div className="text-[12.5px] leading-normal text-destructive">
              {error}
            </div>
          )}

          <Button
            type="button"
            onClick={submit}
            disabled={pending || !email.trim()}
          >
            {pending ? "Sending…" : "Send invite"}
          </Button>

          <div className="text-[12.5px] leading-normal text-ink-muted">
            They will get an email to set their own password. Nobody can create
            an account without an invite.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
