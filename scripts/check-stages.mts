/**
 * Stages are runtime data an admin edits, so the pure helpers around them are
 * the only part that can be checked without a database. Two things here are
 * worth more than they look:
 *
 *   1. Every stage tone must be a real Badge variant name. A typo produces a
 *      badge with no colourway at all, which renders as unstyled text and is
 *      easy to miss in review.
 *   2. slugifyStage runs once, at create time, and its output is then
 *      immutable and referenced by every submission on that stage. A slug that
 *      comes out empty or colliding is not a cosmetic problem.
 */
import { readFileSync } from "node:fs";
import {
  PROTECTED_STAGE_SLUG,
  SEED_STAGE_SLUGS,
  STAGE_TONES,
  STAGE_TONE_LABELS,
  defaultStage,
  isStageTone,
  selectableStages,
  slugifyStage,
  stageLabel,
  stageSlugs,
  stageTone,
  validateStageLabel,
  type Stage,
} from "../lib/console/stages";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

// ---------------------------------------------------------------------------
// 1. Tones must exist as Badge variants, and be constrained in the migration.
// ---------------------------------------------------------------------------
const badge = readFileSync("app/components/ui/badge.tsx", "utf8");
for (const tone of STAGE_TONES) {
  // The variant keys in badge.tsx are written as `positive:` etc.
  ok(new RegExp(`\\b${tone}:`).test(badge),
     `tone "${tone}" is not a variant in app/components/ui/badge.tsx`);
  ok(tone in STAGE_TONE_LABELS, `tone "${tone}" has no label for the picker`);
}
ok(Object.keys(STAGE_TONE_LABELS).length === STAGE_TONES.length,
   "STAGE_TONE_LABELS and STAGE_TONES have drifted apart");

const migration = readFileSync("supabase/migrations/0005_team_and_leads.sql", "utf8");
for (const tone of STAGE_TONES) {
  ok(migration.includes(`'${tone}'`),
     `tone "${tone}" is not allowed by the lead_stages.tone check constraint`);
}
console.log(`ok ${STAGE_TONES.length} tones map to real Badge variants`);

/*
  Ordering inside the migration.

  Postgres parses and validates a `language sql` function body at CREATE time,
  so current_user_role() cannot be defined before profiles.deactivated_at
  exists. Getting this wrong fails the migration halfway through with
  'column "deactivated_at" does not exist', which is only discovered by
  running it: nothing in the TypeScript build or a SQL parse catches it,
  because each statement is individually valid.
*/
const addsDeactivated = migration.indexOf("add column if not exists deactivated_at");
const readsDeactivated = migration.indexOf("create or replace function public.current_user_role");
ok(addsDeactivated > -1, "0005 no longer adds profiles.deactivated_at");
ok(readsDeactivated > -1, "0005 no longer defines current_user_role()");
ok(addsDeactivated < readsDeactivated,
   "profiles.deactivated_at must be added BEFORE current_user_role() is defined, " +
   "or the migration fails at CREATE with 'column does not exist'");

// Same shape of hazard: the stage FK cannot be added before the stage rows it
// points at are seeded, or every existing submission violates it.
const seedsStages = migration.indexOf("insert into public.lead_stages");
const addsStageFk = migration.indexOf("submissions_lead_stage_fkey");
ok(seedsStages > -1 && addsStageFk > -1, "0005 no longer seeds stages or adds the FK");
ok(seedsStages < addsStageFk,
   "lead_stages must be seeded BEFORE the submissions FK is added, or existing " +
   "rows have no stage to reference");
console.log("ok migration 0005 orders columns and seeds before their dependents");

ok(!isStageTone("brand"), "isStageTone must reject an unknown tone");
ok(!isStageTone(undefined), "isStageTone must reject undefined");
ok(isStageTone("neutral"), "isStageTone must accept neutral");

// ---------------------------------------------------------------------------
// 2. The seeded stages in this module must match the ones the migration seeds.
// ---------------------------------------------------------------------------
for (const slug of SEED_STAGE_SLUGS) {
  ok(migration.includes(`'${slug}'`),
     `seed slug "${slug}" is not seeded by migration 0005`);
}
ok((SEED_STAGE_SLUGS as readonly string[]).includes(PROTECTED_STAGE_SLUG),
   "the protected slug must be one of the seeded stages");
// The protected slug is protected because submissions.lead_stage defaults to
// it in 0001. If that default ever moves, this assumption has to move with it.
const init = readFileSync("supabase/migrations/0001_init.sql", "utf8");
ok(new RegExp(`lead_stage\\s+text not null default '${PROTECTED_STAGE_SLUG}'`).test(init),
   `submissions.lead_stage no longer defaults to '${PROTECTED_STAGE_SLUG}': PROTECTED_STAGE_SLUG is stale`);
console.log(`ok ${SEED_STAGE_SLUGS.length} seed slugs match migration 0005`);

// ---------------------------------------------------------------------------
// 3. slugifyStage.
// ---------------------------------------------------------------------------
const slugCases: [string, string][] = [
  ["New", "new"],
  ["In progress", "in-progress"],
  ["Contacted", "contacted"],
  ["Closed", "closed"],
  ["Closed / Won", "closed-won"],
  ["  Padded  ", "padded"],
  ["Follow-up #2", "follow-up-2"],
  ["Prêt à contacter", "pret-a-contacter"],
  ["Über alles", "uber-alles"],
  ["Trailing----", "trailing"],
  ["---Leading", "leading"],
  ["multiple   spaces", "multiple-spaces"],
  ["🎉", ""],
  ["!!!", ""],
  ["", ""],
];
for (const [input, want] of slugCases) {
  const got = slugifyStage(input);
  ok(got === want, `slugifyStage(${JSON.stringify(input)}) gave ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
// The DB constrains slug to ^[a-z0-9-]{2,40}$, so any non-empty slug we
// generate must satisfy it or the insert fails with a check violation.
for (const [input] of slugCases) {
  const s = slugifyStage(input);
  if (!s) continue;
  ok(/^[a-z0-9-]{2,40}$/.test(s),
     `slugifyStage(${JSON.stringify(input)}) produced ${JSON.stringify(s)}, which the DB check rejects`);
}
ok(slugifyStage("A".repeat(80)).length === 40, "slugifyStage must cap at 40 characters");
ok(!slugifyStage("A".repeat(39) + " tail").endsWith("-"),
   "a slug must not end in a hyphen after the length cut");
console.log(`ok ${slugCases.length} slug cases, all DB-constraint safe`);

// ---------------------------------------------------------------------------
// 4. Lookups and their fallbacks.
// ---------------------------------------------------------------------------
const mk = (over: Partial<Stage>): Stage => ({
  id: over.slug ?? "id", slug: "new", label: "New", sortOrder: 10,
  isDefault: false, isTerminal: false, tone: "neutral", retired: false, ...over,
});
const stages: Stage[] = [
  mk({ slug: "new", label: "New", isDefault: true, tone: "neutral", sortOrder: 10 }),
  mk({ slug: "in-progress", label: "In progress", tone: "accent", sortOrder: 20 }),
  mk({ slug: "contacted", label: "Contacted", tone: "warning", sortOrder: 30 }),
  mk({ slug: "closed", label: "Closed", tone: "positive", isTerminal: true, sortOrder: 40 }),
  mk({ slug: "old-stage", label: "Retired stage", retired: true, sortOrder: 50 }),
];

ok(stageLabel("contacted", stages) === "Contacted", "stageLabel should resolve a known slug");
ok(stageTone("closed", stages) === "positive", "stageTone should resolve a known slug");
// An unknown slug must degrade rather than throw: a lead can be sitting on a
// stage that was deleted directly in SQL.
ok(stageLabel("gone", stages) === "gone",
   "stageLabel should fall back to the slug itself, so the oddity stays visible");
ok(stageTone("gone", stages) === "neutral", "stageTone should fall back to neutral");
ok(stageLabel("old-stage", stages) === "Retired stage",
   "a retired stage must still render its label");

ok(selectableStages(stages).length === 4, "retired stages must not be selectable");
ok(!selectableStages(stages).some((s) => s.retired), "selectableStages leaked a retired stage");
ok(stageSlugs(stages).includes("old-stage"),
   "stageSlugs must include retired slugs so an existing filter URL keeps working");
ok(defaultStage(stages)?.slug === "new", "defaultStage should find the default");
ok(defaultStage(stages.map((s) => ({ ...s, isDefault: false }))) === undefined,
   "defaultStage should return undefined when none is set");
// A retired default should not be offered, even if the flag is somehow set.
ok(defaultStage([mk({ slug: "x", isDefault: true, retired: true })]) === undefined,
   "a retired stage must never be treated as the default");
console.log("ok stage lookups fall back safely");

// ---------------------------------------------------------------------------
// 5. Label validation.
// ---------------------------------------------------------------------------
ok(validateStageLabel("Qualified", stages) === "", "a fresh label should validate");
ok(validateStageLabel("", stages) !== "", "an empty label must be rejected");
ok(validateStageLabel("   ", stages) !== "", "a whitespace label must be rejected");
ok(validateStageLabel("Contacted", stages) !== "", "a duplicate label must be rejected");
ok(validateStageLabel("contacted", stages) !== "",
   "duplicate detection must be case-insensitive");
ok(validateStageLabel("A".repeat(61), stages) !== "", "an over-long label must be rejected");
ok(validateStageLabel("A".repeat(60), stages) === "", "60 characters must be allowed");
ok(validateStageLabel("🎉", stages) !== "",
   "a label that slugifies to nothing must be rejected");
// Renaming a stage to its own current label is a no-op, not a duplicate.
const contacted = stages[2];
ok(validateStageLabel("Contacted", stages, { ignoreId: contacted.id }) === "",
   "renaming a stage to its own label must be allowed");
ok(validateStageLabel("Closed", stages, { ignoreId: contacted.id }) !== "",
   "renaming onto another stage's label must be rejected");
// A rename does not touch the slug, so a slug collision is only a create-time
// concern and must not block an otherwise valid rename.
ok(validateStageLabel("Closed!", stages, { ignoreId: contacted.id }) === "",
   "a rename must not be blocked by a slug collision");
console.log("ok label validation covers duplicates, length and renames");

if (fails) { console.log(`\n${fails} check(s) failed`); process.exit(1); }
console.log("check-stages: pass");
