import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCategory, sanitizeAnswers, type Answers } from "@/lib/discovery/schema";
import { getTenant } from "@/lib/tenant/resolve";
import { TenantTheme } from "@/app/components/tenant-theme";
import type { DraftHandle } from "./actions";
import { DiscoveryFlow } from "./discovery-flow";

/**
 * Tenant-aware, like the portal layout and unlike the root layout.
 *
 * This is the page a partner's lead actually fills in: the portal behind it
 * is for the partner, but the form is what their customer sees, so it has to
 * carry the partner's mark and palette or the white-label is only skin deep.
 * The route is already dynamic (it reads searchParams), so getTenant()'s
 * headers() read costs nothing extra here. app/layout.tsx must still not call
 * it, or the statically prerendered apex marketing page goes dynamic.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const name = tenant && !tenant.isHouse ? (tenant.branding.companyName ?? tenant.name) : null;
  return {
    title: name ? `Discovery · ${name}` : "Discovery",
    description:
      "Pick a category, then six steps about your team, payroll setup, and priorities. Ranges are fine everywhere, and each answered step is saved.",
    alternates: { canonical: "/discovery" },
    robots: { index: false },
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResumedDraft {
  handle: DraftHandle;
  answers: Answers;
  stepsCompleted: number;
}

/** Loads a draft from an emailed resume link (?r=<token>). */
async function loadResumedDraft(token: string): Promise<ResumedDraft | null> {
  if (!UUID_RE.test(token)) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("submissions")
    .select("id, resume_token, status, answers, steps_completed")
    .eq("resume_token", token)
    .eq("status", "partial")
    .maybeSingle();
  if (!data) return null;
  return {
    handle: { draftId: data.id, token: data.resume_token },
    answers: sanitizeAnswers(data.answers),
    stepsCompleted: data.steps_completed,
  };
}

export default async function DiscoveryPage(props: PageProps<"/discovery">) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.r === "string" ? searchParams.r : null;
  const resumed = token ? await loadResumedDraft(token) : null;

  // The home page offers two entry points: the standard discovery, and
  // "benchmark my renewal", which preselects the renewal driver. Deep links
  // may also name a category so the picker can be skipped.
  const intent = searchParams.intent === "renewal" ? "renewal" : "shop";
  const category = isCategory(searchParams.category)
    ? searchParams.category
    : undefined;

  // Null on a host this deployment does not serve; the flow then renders the
  // house identity, matching currentTenantIdForWrite's fallback for the data.
  const tenant = await getTenant();

  return (
    <>
      {tenant && <TenantTheme branding={tenant.branding} />}
      <DiscoveryFlow
        resumed={resumed}
        intent={intent}
        presetCategory={category}
        tenant={
          tenant
            ? { isHouse: tenant.isHouse, name: tenant.name, branding: tenant.branding }
            : null
        }
      />
    </>
  );
}
