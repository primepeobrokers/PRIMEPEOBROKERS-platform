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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { cn } from "@/lib/utils";
import { contrastRatio, logoUrl, type Branding } from "@/lib/tenant/branding";
import {
  invitePartnerUser,
  setPartnerUserActive,
  removePartnerLogo,
  savePartnerBranding,
  setPartnerSuspended,
  uploadPartnerLogo,
} from "./actions";

/** One person with a login to a partner's portal. */
export interface PartnerMember {
  id: string;
  name: string | null;
  email: string | null;
  /** Set means their access was removed; the row stays so their name resolves. */
  deactivatedAt: string | null;
}

export interface PartnerRow {
  id: string;
  slug: string;
  name: string;
  branding: Branding;
  suspendedAt: string | null;
  leadCount: number;
  members: PartnerMember[];
}

/** Members who can actually sign in. Removed people stay in the list, greyed. */
function activeMembers(partner: PartnerRow): PartnerMember[] {
  return partner.members.filter((m) => !m.deactivatedAt);
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
            No partners yet. Use &ldquo;Add a partner&rdquo; above, and their
            portal is live as soon as the subdomain resolves.
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
        <TableBody data-rows>
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
          {activeMembers(partner).length}
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
            {/*
              TABS, NOT ONE FLAT WALL.

              This panel used to open as a two-column grid with everything in
              it at once: an eight-field branding form, the login roster, the
              invite form and the Suspend button, all visible together. Three
              unrelated jobs competing for the same glance, and the most
              common one (issuing a login) sat below the one almost nobody
              touches twice (colours). Suspend, which closes a partner's
              portal, was permanently on screen next to routine controls.

              One job per tab. Logins first because it is what this screen is
              opened for. Access last, so a destructive action takes a
              deliberate click to reach rather than sitting under the cursor.

              min-w-0 on the content: without it a long email or a wide input
              refuses to shrink and gives the whole table a horizontal
              scrollbar.
            */}
            {/*
              whitespace-normal is load-bearing, and the bug it fixes is
              invisible to a box-overlap check.

              This panel is nested inside a <td>, and TableCell sets
              whitespace-nowrap so that a row of data never wraps mid-value.
              white-space INHERITS, so every paragraph in this form was
              nowrap too: the logo hint and the field hints rendered as one
              long unbroken line each, painting straight across the column
              beside them and running out past the panel edge, clipped
              mid-word.

              Their boxes stayed the declared 320px the whole time (the text
              overflowed without widening them), which is why min-w-0 on the
              grid did not help and why a detector comparing bounding boxes
              found nothing to report.

              Reset it here, once, at the panel root, rather than per
              paragraph: everything inside this drawer is a form, and no part
              of a form wants table wrapping rules.
            */}
            <div
              id={`partner-panel-${partner.id}`}
              className="pv-panel whitespace-normal p-5"
            >
              <Tabs defaultValue="logins" className="gap-4">
                <TabsList variant="line" className="w-full justify-start">
                  <TabsTrigger value="logins" className="flex-none px-3">
                    <MailIcon className="size-3.5" aria-hidden="true" />
                    Logins
                    <span className="ml-1 font-mono text-[11px] text-ink-faint">
                      {activeMembers(partner).length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="branding" className="flex-none px-3">
                    <PaletteIcon className="size-3.5" aria-hidden="true" />
                    Branding
                  </TabsTrigger>
                  <TabsTrigger value="access" className="flex-none px-3">
                    Access
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="logins" className="min-w-0 max-w-[640px]">
                  <PeoplePanel partner={partner} />
                </TabsContent>
                <TabsContent value="branding" className="min-w-0">
                  <BrandingPanel partner={partner} />
                </TabsContent>
                <TabsContent value="access" className="min-w-0 max-w-[640px]">
                  <SuspendPanel partner={partner} />
                </TabsContent>
              </Tabs>
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
  const [crmPartnerName, setCrmPartnerName] = useState(b.crmPartnerName ?? "");
  const [legalName, setLegalName] = useState(b.legalName ?? "");
  const [contactUrl, setContactUrl] = useState(b.contactUrl ?? "");
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
        crmPartnerName,
        legalName,
        contactUrl,
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

  /*
    No section heading here: the tab is the heading. Two columns rather than
    one, because eight stacked fields in a single narrow column made the form
    taller than the viewport and pushed Save out of sight.
  */
  return (
    <div className="grid gap-x-8 gap-y-3 [&>*]:min-w-0 md:grid-cols-[minmax(0,360px)_minmax(0,320px)]">
      <div className="flex min-w-0 flex-col gap-3">
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
            id={`ln-${partner.id}`}
            label="Legal name"
            value={legalName}
            onChange={setLegalName}
            placeholder="Defaults to the display name"
            disabled={pending}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            Their registered entity. The footer of every page on their site
            names them as the referral partner.
          </p>
        </div>
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
        <div>
          <Field
            id={`cu-${partner.id}`}
            label="Contact link"
            value={contactUrl}
            onChange={setContactUrl}
            placeholder="https://partner.com/contact or an email"
            disabled={pending}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            Where Contact and Talk to an advisor go on their site. Falls back
            to the partner email. Privacy, terms and data requests always go to
            Prime.
          </p>
        </div>

        {/* Attribution. Stamped onto every lead this partner captures, so
            whoever works the export knows who to credit. */}
        <div>
          <Field
            id={`crm-${partner.id}`}
            label="CRM partner name"
            value={crmPartnerName}
            onChange={setCrmPartnerName}
            placeholder="Defaults to the display name"
            disabled={pending}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            How this partner appears on their leads in the export. Existing
            leads keep whatever they were stamped with.
          </p>
        </div>
      </div>

      {/* Second column: the visual assets. Grouping the three colour pickers
          with the logo keeps the eye in one place while matching a brand,
          instead of scrolling past name and email fields between each pick. */}
      <div className="flex min-w-0 flex-col gap-3">
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
      </div>

      {/* Save spans both columns so it reads as saving the whole form, not
          just the column it happens to sit under. */}
      <div className="flex flex-col gap-3 md:col-span-2">
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
    <div className="min-w-0">
      {/* `block`, for the reason spelled out in Field below: a bare inline
          label does not stack, so the mt-1.5 on the row under it never
          applied and the row started at the label right edge. This one was a
          <span> rather than a <label>, so it was missed when Field and
          ColorField were fixed. */}
      <span className="block text-[13px] text-ink-soft">Logo</span>
      {/* min-w-0 and flex-wrap: without them this row takes a minimum width
          from the preview box plus two buttons, refuses to shrink below it,
          and overflows the 320px grid column, dragging the help text beneath
          it out past the panel edge. */}
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-md border border-line bg-raised px-2">
          {logo ? (
            /* Plain <img>, as in TenantMark: the optimizer is off by design. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(logo.path)}
              alt={`${partner.branding.companyName ?? partner.name} logo`}
              /* maxWidth caps a wide wordmark. Without it a 900px logo sets
                 the row width and overflows the column. */
              style={{
                height: 28,
                width: "auto",
                maxWidth: 120,
                objectFit: "contain",
                display: "block",
              }}
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
  /*
    `block` on the label is load-bearing, not cosmetic. A bare <label> is
    display:inline, so the w-full Input started at the label's right edge and
    ran the label's width past the column, overlapping the panel beside it.
    The mt-1.5 never applied either, because nothing was stacked.
  */
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] text-ink-soft">
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
    <div className="min-w-0">
      {/* `block`, for the reason spelled out in Field above: a bare <label>
          is display:inline, so it does not stack and its mt-1.5 never
          applies. */}
      <label htmlFor={id} className="block text-[13px] text-ink-soft">
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

/**
 * Who can sign in to this partner's portal, and the controls to change it.
 *
 * A partner firm usually has more than one person who needs access, and the
 * client has to be able to add, resend and revoke without asking a developer:
 * that is the SOW's "issue partner logins without developer involvement".
 *
 * Removed people stay listed, greyed, with a Restore button. Their profile row
 * has to survive anyway so their name keeps resolving on anything they
 * touched, and showing them is what makes "why can Dana not sign in" a
 * five-second question instead of a support email.
 */
function PeoplePanel({ partner }: { partner: PartnerRow }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  /** Errors from the "Add someone" form, which has no row to sit under. */
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  /** The member id currently being resent or revoked, for a per-row spinner. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /*
    Errors keyed by member, so a failed resend on the third person appears
    under the third person. They used to land in the panel-level `error` at
    the bottom of the list, where "that person was removed" gave no clue which
    of five rows it meant.
  */
  const [rowError, setRowError] = useState<Record<string, string>>({});
  /** The member the Remove dialog is asking about, or null when closed. */
  const [confirmRemove, setConfirmRemove] = useState<PartnerMember | null>(null);

  /*
    Mirrors the guard in migration 0013 so the dialog can explain the refusal
    before the click rather than after it. The database is the authority: this
    reads a snapshot of the roster and a concurrent removal could invalidate
    it, which is exactly why the real check counts under an advisory lock.
  */
  const lastActiveLogin =
    confirmRemove !== null &&
    !confirmRemove.deactivatedAt &&
    activeMembers(partner).length <= 1;

  const setRowErrorFor = (id: string, message: string) =>
    setRowError((prev) => ({ ...prev, [id]: message }));
  const clearRowError = (id: string) =>
    setRowError((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const invite = () => {
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

  /*
    Resend goes through the same action as a new invite. The server decides:
    an unknown address is invited, a known one on this partner gets a fresh
    sign-in link, and an address belonging to anyone else is refused. Keeping
    that decision server-side means the button cannot be wrong about which
    case it is in.
  */
  const resend = (m: PartnerMember) => {
    if (pending || !m.email) return;
    clearRowError(m.id);
    setBusyId(m.id);
    startTransition(async () => {
      const result = await invitePartnerUser({
        tenantId: partner.id,
        email: m.email!,
        fullName: m.name ?? "",
      });
      setBusyId(null);
      if ("error" in result) {
        setRowErrorFor(m.id, result.error);
        return;
      }
      toast.success(result.message ?? `A fresh link was sent to ${m.email}.`);
    });
  };

  const setActive = (m: PartnerMember, active: boolean) => {
    if (pending) return;
    clearRowError(m.id);
    setBusyId(m.id);
    startTransition(async () => {
      const result = await setPartnerUserActive({
        tenantId: partner.id,
        profileId: m.id,
        active,
      });
      setBusyId(null);
      setConfirmRemove(null);
      if ("error" in result) {
        setRowErrorFor(m.id, result.error);
        return;
      }
      toast.success(result.message ?? "Access updated.");
    });
  };

  // The tab is the heading; no duplicate label here.
  return (
    <div>
      {partner.members.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-raised">
          {partner.members.map((m) => {
            const removed = !!m.deactivatedAt;
            const rowBusy = busyId === m.id && pending;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div
                    className={cn(
                      "truncate text-[13.5px] font-medium",
                      removed ? "text-ink-faint" : "text-ink",
                    )}
                  >
                    {m.name || m.email || "Unnamed"}
                  </div>
                  {m.name && m.email && (
                    <div className="truncate font-mono text-[11.5px] text-ink-muted">
                      {m.email}
                    </div>
                  )}
                </div>
                {/*
                  Disabled per row, not panel-wide: `pending` is one flag for
                  the whole transition, so resending for one person used to
                  grey out every other row's buttons at the same time.
                */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {removed ? (
                    <>
                      <Badge variant="neutral" tone="mono">
                        No access
                      </Badge>
                      <Button
                        onClick={() => setActive(m, true)}
                        disabled={rowBusy}
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                      >
                        {rowBusy && <Loader2Icon className="size-4 animate-spin" />}
                        Restore
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => resend(m)}
                        disabled={rowBusy || !m.email}
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                      >
                        {rowBusy && <Loader2Icon className="size-4 animate-spin" />}
                        Resend link
                      </Button>
                      {/*
                        Confirmed, like Suspend. Removing a login is
                        destructive and was a single unguarded click, which
                        sat one row above "Resend link" and two pixels from
                        it.
                      */}
                      <Button
                        onClick={() => setConfirmRemove(m)}
                        disabled={rowBusy}
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-ink-muted hover:text-danger"
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
                {rowError[m.id] && (
                  <div
                    role="alert"
                    className="w-full text-[12.5px] leading-snug text-danger"
                  >
                    {rowError[m.id]}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3.5 rounded-md border border-dashed border-line px-3.5 py-3 text-[13px] text-ink-muted">
          Nobody has a login yet. Add the first person below.
        </p>
      )}

      {/*
        One dialog for the whole list, driven by which member is in state,
        rather than one mounted per row. Removing the last active login is
        refused by the database (migration 0013), but the warning is stated
        here too so the admin is not surprised by an error after confirming.
      */}
      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[-.015em]">
              Remove {confirmRemove?.name || confirmRemove?.email || "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lastActiveLogin ? (
                <>
                  This is the only person who can sign in to{" "}
                  {partner.branding.companyName ?? partner.name}. Removing them
                  leaves the partner with no way into their portal, so add
                  someone else first, or suspend the partner instead.
                </>
              ) : (
                <>
                  They lose access to{" "}
                  {partner.branding.companyName ?? partner.name} immediately.
                  Nothing they have done is deleted, their name still shows on
                  past activity, and you can restore them at any time.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || lastActiveLogin}
              onClick={(e) => {
                e.preventDefault();
                if (confirmRemove) setActive(confirmRemove, false);
              }}
            >
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Its own bordered block, so "adding a person" reads as a separate act
        from "managing the people already there". The two fields sit side by
        side: stacked, they made a short form look like a long one, and the
        helper text ended up far from the button it explains.
      */}
      <div className="mt-4 rounded-md border border-dashed border-line p-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-ink-faint">
          Add someone
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            onClick={invite}
            disabled={pending || !email.trim()}
            variant="secondary"
            className="cursor-pointer"
          >
            {pending && !busyId && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            Send invite
          </Button>
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">
            The link lands on their own portal, so their session belongs to
            their subdomain.
          </p>
        </div>
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
      <div className="rounded-md border border-line bg-raised p-3.5">
        <p className="text-[13px] text-ink-soft">
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
    <div className="rounded-md border border-danger/30 bg-raised p-3.5">
      <p className="text-[13px] text-ink-soft">
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
              Their portal will return a 404 and their{" "}
              {activeMembers(partner).length} login
              {activeMembers(partner).length === 1 ? "" : "s"} will stop working on
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
