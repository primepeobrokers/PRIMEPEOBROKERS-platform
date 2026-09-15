"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  ImageIcon,
  Loader2Icon,
  MailIcon,
  PaletteIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { contrastRatio, logoUrl, type Branding } from "@/lib/tenant/branding";
import {
  invitePartnerUser,
  removePartnerLogo,
  savePartnerBranding,
  setPartnerSuspended,
  uploadPartnerLogo,
} from "./actions";

export interface PartnerRow {
  id: string;
  slug: string;
  name: string;
  branding: Branding;
  suspendedAt: string | null;
  leadCount: number;
  userCount: number;
}

/**
 * The partner roster, with branding, invites and suspension inline.
 *
 * One expandable row per partner rather than a detail route: a partner has
 * three or four editable facts, and a separate page per partner would be more
 * navigation than content. The house tenant is deliberately absent from this
 * list; it is managed through /console/team.
 */
export function PartnersTable({
  partners,
  apexHost,
}: {
  partners: PartnerRow[];
  apexHost: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (partners.length === 0) {
    return (
      <Card className="rounded-md">
        <CardContent className="py-10 text-center">
          <p className="text-[14px] text-ink-muted">
            No partners yet. Add one above and their portal is live as soon as
            the subdomain resolves.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-raised">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Partner</TableHead>
            <TableHead>Portal</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Logins</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((p) => (
            <PartnerRowView
              key={p.id}
              partner={p}
              apexHost={apexHost}
              expanded={open === p.id}
              onToggle={() => setOpen(open === p.id ? null : p.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PartnerRowView({
  partner,
  apexHost,
  expanded,
  onToggle,
}: {
  partner: PartnerRow;
  apexHost: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const suspended = !!partner.suspendedAt;
  const host = `${partner.slug}.${apexHost}`;

  return (
    <>
      <TableRow className={suspended ? "opacity-60" : undefined}>
        <TableCell>
          <div className="text-[15px] font-semibold text-ink">
            {partner.branding.companyName ?? partner.name}
          </div>
          {partner.branding.companyName &&
            partner.branding.companyName !== partner.name && (
              <div className="mt-[3px] text-[12.5px] text-ink-muted">
                Registered as {partner.name}
              </div>
            )}
        </TableCell>

        <TableCell>
          <a
            href={`https://${host}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm font-mono text-[13px] text-ink-soft outline-none transition-colors duration-150 hover:text-accent-press focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {host}
            <ExternalLinkIcon className="size-3" aria-hidden="true" />
          </a>
        </TableCell>

        <TableCell className="text-right font-mono text-sm">
          {partner.leadCount}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {partner.userCount}
        </TableCell>

        <TableCell>
          {suspended ? (
            <Badge variant="warning" tone="mono">
              Suspended
            </Badge>
          ) : (
            <Badge variant="positive" tone="mono">
              Active
            </Badge>
          )}
        </TableCell>

        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`partner-panel-${partner.id}`}
            className="cursor-pointer"
          >
            <ChevronDownIcon
              className={`size-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            <span className="sr-only">
              {expanded ? "Hide" : "Show"} settings for{" "}
              {partner.branding.companyName ?? partner.name}
            </span>
          </Button>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-sunken p-0">
            <div id={`partner-panel-${partner.id}`} className="grid gap-5 p-5 md:grid-cols-2">
              <BrandingPanel partner={partner} />
              <div className="flex flex-col gap-5">
                <InvitePanel partner={partner} />
                <SuspendPanel partner={partner} />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * The "configurable without a redeploy" panel.
 *
 * Three colours, not thirty. The greys in globals.css are derived by mixing
 * navy into white, so exposing them individually would break the family
 * relationship the brand guide establishes; brandingToCss derives them with
 * color-mix instead. Three pickers is also the difference between a form the
 * client will use and one they will not.
 */
function BrandingPanel({ partner }: { partner: PartnerRow }) {
  const b = partner.branding;
  const [companyName, setCompanyName] = useState(b.companyName ?? "");
  const [shortName, setShortName] = useState(b.shortName ?? "");
  const [supportEmail, setSupportEmail] = useState(b.supportEmail ?? "");
  const [accent, setAccent] = useState(b.colors?.accent ?? "#ff2d00");
  const [ink, setInk] = useState(b.colors?.ink ?? "#19233b");
  const [dark, setDark] = useState(b.colors?.dark ?? "#19233b");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /*
    Contrast shown live, so the refusal in the action is never a surprise. The
    thresholds match: under 3:1 the save is rejected outright, and 3:1 to 4.5:1
    is the band the house orange itself sits in, usable for buttons and large
    text but not body copy.
  */
  const accentRatio = contrastRatio(accent, "#ffffff");
  const inkRatio = contrastRatio(ink, "#ffffff");

  const submit = () => {
    if (pending) return;
    setError("");
    startTransition(async () => {
      const result = await savePartnerBranding({
        tenantId: partner.id,
        companyName,
        shortName,
        supportEmail,
        accent,
        ink,
        dark,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Branding saved.");
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
        <PaletteIcon className="size-3.5" aria-hidden="true" />
        Branding
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        <Field
          id={`cn-${partner.id}`}
          label="Display name"
          value={companyName}
          onChange={setCompanyName}
          placeholder={partner.name}
          disabled={pending}
        />
        <Field
          id={`sn-${partner.id}`}
          label="Short name"
          value={shortName}
          onChange={setShortName}
          placeholder="For tight spaces"
          disabled={pending}
        />
        <div>
          <Field
            id={`se-${partner.id}`}
            label="Partner email"
            value={supportEmail}
            onChange={setSupportEmail}
            placeholder="ops@partner.com"
            disabled={pending}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            Their work address. Gets an alert for every new lead, and replies
            to their leads&rsquo; emails land here.
          </p>
        </div>

        <LogoField partner={partner} />

        <ColorField
          id={`ac-${partner.id}`}
          label="Accent"
          hint="Buttons and highlights"
          value={accent}
          onChange={setAccent}
          ratio={accentRatio}
          floor={3}
          disabled={pending}
        />
        <ColorField
          id={`ik-${partner.id}`}
          label="Body text"
          hint="Must reach 4.5:1"
          value={ink}
          onChange={setInk}
          ratio={inkRatio}
          floor={4.5}
          disabled={pending}
        />
        <ColorField
          id={`dk-${partner.id}`}
          label="Header"
          hint="The portal's dark bar"
          value={dark}
          onChange={setDark}
          disabled={pending}
        />

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button
          onClick={submit}
          disabled={pending}
          className="w-fit cursor-pointer"
        >
          {pending && <Loader2Icon className="size-4 animate-spin" />}
          Save branding
        </Button>
      </div>
    </div>
  );
}

/**
 * The partner's logo.
 *
 * The only branding input that is a file. Uploaded straight from the change
 * event rather than staged in the form: the other fields save as one object
 * and a file cannot travel in it, so making the logo part of "Save branding"
 * would have meant a second, invisible upload step.
 *
 * PNG or WebP, 200KB. Not SVG: served from our own origin it can carry
 * script, and the action rejects it by magic bytes whatever the extension.
 */
function LogoField({ partner }: { partner: PartnerRow }) {
  const logo = partner.branding.logo;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | null) => {
    if (!file || pending) return;
    setError("");
    const data = new FormData();
    data.set("tenantId", partner.id);
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadPartnerLogo(data);
      if (inputRef.current) inputRef.current.value = "";
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Logo saved.");
    });
  };

  const remove = () => {
    if (pending) return;
    setError("");
    startTransition(async () => {
      const result = await removePartnerLogo({ tenantId: partner.id });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Logo removed.");
    });
  };

  const inputId = `lg-${partner.id}`;

  return (
    <div>
      <span className="text-[13px] text-ink-soft">Logo</span>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="flex h-12 min-w-12 items-center justify-center rounded-md border border-line bg-raised px-2">
          {logo ? (
            /* Plain <img>, as in TenantMark: the optimizer is off by design. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(logo.path)}
              alt={`${partner.branding.companyName ?? partner.name} logo`}
              style={{ height: 28, width: "auto", display: "block" }}
            />
          ) : (
            <ImageIcon className="size-4 text-ink-faint" aria-hidden="true" />
          )}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/webp"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <Button
          asChild
          variant="secondary"
          size="sm"
          disabled={pending}
          className="cursor-pointer"
        >
          <label htmlFor={inputId}>
            {pending && <Loader2Icon className="size-4 animate-spin" />}
            {logo ? "Replace" : "Upload"}
          </label>
        </Button>
        {logo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={pending}
            className="cursor-pointer"
          >
            <XIcon className="size-4" aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-muted">
        PNG or WebP, up to 200KB. Shown in their portal header, on their
        discovery form and at the top of their emails.
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[13px] text-ink-soft">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1.5"
      />
    </div>
  );
}

/**
 * A colour with its live contrast against white.
 *
 * The number is the point: a partner picking a pale accent produces a portal
 * that fails WCAG AA on every label, and showing the ratio as they choose is
 * what makes that visible before they save rather than after.
 */
function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  ratio,
  floor,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  ratio?: number;
  floor?: number;
  disabled?: boolean;
}) {
  const fails = ratio !== undefined && floor !== undefined && ratio < floor;
  const marginal = ratio !== undefined && !fails && ratio < 4.5;

  return (
    <div>
      <label htmlFor={id} className="text-[13px] text-ink-soft">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-raised p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} hex value`}
          className="font-mono"
        />
      </div>
      <p
        className={`mt-1.5 text-[12.5px] ${fails ? "text-danger" : marginal ? "text-warning" : "text-ink-muted"}`}
      >
        {ratio === undefined
          ? hint
          : fails
            ? `${ratio.toFixed(1)}:1 on white. Too low to save (${floor}:1 minimum).`
            : marginal
              ? `${ratio.toFixed(1)}:1 on white. Large text and buttons only.`
              : `${ratio.toFixed(1)}:1 on white. ${hint}.`}
      </p>
    </div>
  );
}

/** Issue a partner login. */
function InvitePanel({ partner }: { partner: PartnerRow }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending || !email.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await invitePartnerUser({
        tenantId: partner.id,
        email,
        fullName,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEmail("");
      setFullName("");
      toast.success(result.message ?? "Invite sent.");
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
        <MailIcon className="size-3.5" aria-hidden="true" />
        Issue a login
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        <Field
          id={`ie-${partner.id}`}
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="ops@partner.com"
          disabled={pending}
        />
        <Field
          id={`in-${partner.id}`}
          label="Name"
          value={fullName}
          onChange={setFullName}
          placeholder="Optional"
          disabled={pending}
        />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button
          onClick={submit}
          disabled={pending || !email.trim()}
          variant="secondary"
          className="w-fit cursor-pointer"
        >
          {pending && <Loader2Icon className="size-4 animate-spin" />}
          Send invite
        </Button>
        <p className="text-[12.5px] text-ink-muted">
          The link lands on their own portal, so their session belongs to their
          subdomain.
        </p>
      </div>
    </div>
  );
}

/** Close or reopen a partner's portal. */
function SuspendPanel({ partner }: { partner: PartnerRow }) {
  const suspended = !!partner.suspendedAt;
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  const run = () => {
    startTransition(async () => {
      const result = await setPartnerSuspended({
        tenantId: partner.id,
        suspended: !suspended,
      });
      setDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Updated.");
    });
  };

  if (suspended) {
    return (
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
          Access
        </div>
        <p className="mt-2 text-[13px] text-ink-soft">
          Their portal is closed and their logins are disabled. Every lead,
          note and event is untouched.
        </p>
        <Button
          onClick={run}
          disabled={pending}
          variant="secondary"
          className="mt-3 w-fit cursor-pointer"
        >
          {pending && <Loader2Icon className="size-4 animate-spin" />}
          Restore access
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-muted">
        Access
      </div>
      <p className="mt-2 text-[13px] text-ink-soft">
        Suspending closes their portal and disables their logins. Nothing is
        deleted, and you keep every lead.
      </p>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" className="mt-3 w-fit cursor-pointer">
            Suspend partner
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[-.015em]">
              Suspend {partner.branding.companyName ?? partner.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their portal will return a 404 and their {partner.userCount}{" "}
              login{partner.userCount === 1 ? "" : "s"} will stop working on
              the next request. Their {partner.leadCount} lead
              {partner.leadCount === 1 ? "" : "s"} stay in your console. You can
              restore them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
