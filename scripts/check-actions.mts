/**
 * Structural checks on the console's server actions.
 *
 * These cannot run the actions (that needs a session and a database), so they
 * assert the properties that are checkable from the source and that have
 * actually gone wrong here before:
 *
 *   1. Every mutating action guards before it does anything else. A server
 *      action is an addressable endpoint, so a missing guard is not a
 *      hypothetical: it is an open write endpoint.
 *   2. Admin-only actions ask for the admin role specifically.
 *   3. Mutations revalidate, or the list serves a cached payload of the value
 *      that was just changed.
 *   4. The RPC argument names match what the database functions declare. A
 *      mismatch is a runtime 404 from PostgREST, which nothing else catches.
 *   5. A "use server" file exports only async functions, which is a build
 *      error that typecheck does not see.
 */
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

const FILES = [
  "app/console/leads/[id]/actions.ts",
  "app/console/team/actions.ts",
  "app/console/team/stage-actions.ts",
] as const;

/** Rough body extraction: from the export line to the next top-level export. */
function bodies(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /export async function (\w+)\(/g;
  const marks: [string, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marks.push([m[1], m.index]);
  for (const [i, [name, start]] of marks.entries()) {
    out[name] = src.slice(start, marks[i + 1]?.[1] ?? src.length);
  }
  return out;
}

// Actions that deliberately do not mutate, so they are exempt from the
// revalidate rule. logRecordOpen must NOT revalidate: it fires from a mount
// effect and would re-render the page that triggered it, in a loop.
const READ_ONLY = new Set(["logRecordOpen"]);
const ADMIN_ONLY = new Set([
  "inviteTeammate", "changeRole", "removeTeammate", "restoreTeammate",
  "createStage", "renameStage", "reorderStages", "retireStage", "restoreStage",
]);

let checked = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");

  ok(src.startsWith('"use server"'), `${file} must start with "use server"`);

  /*
    A "use server" module may only export async functions at runtime.
    Exporting a value is a build failure, and an easy mistake because it
    type-checks cleanly: NOTE_MAX hit exactly this.

    Types and interfaces are fine, because they are erased before the module
    ever exists at runtime. Only runtime bindings are checked here.
  */
  const badExport = /^export (?:const|let|var|class|function [^*])/m.exec(src);
  ok(badExport === null,
     `${file} exports a runtime value from a "use server" module: ` +
     `"${badExport?.[0]?.trim()}". Only async functions may be exported; ` +
     `move constants to a plain module.`);

  for (const [name, body] of Object.entries(bodies(src))) {
    checked++;

    ok(body.includes("guardAction("),
       `${file}: ${name}() does not call guardAction. Server actions are ` +
       `addressable endpoints; an unguarded one is an open write endpoint.`);

    if (ADMIN_ONLY.has(name)) {
      ok(/guardAction\(\s*"admin"\s*\)/.test(body),
         `${file}: ${name}() is admin-only but guards with no role argument`);
    }

    if (!READ_ONLY.has(name)) {
      ok(/revalidatePath|revalidate\w*\(/.test(body),
         `${file}: ${name}() mutates but never revalidates, so the list will ` +
         `serve a cached payload of the value it just changed`);
    } else {
      ok(!body.includes("revalidatePath("),
         `${file}: ${name}() must not revalidate; it fires from a mount ` +
         `effect and would re-render the page that triggered it`);
    }
  }
}
console.log(`ok ${checked} actions across ${FILES.length} files guard and revalidate`);

// The dynamic-segment form. revalidatePath on a dynamic route needs the
// literal bracket path plus the "page" kind; interpolating the real id
// silently invalidates only one lead, and passing no kind is a no-op.
const leadActions = readFileSync("app/console/leads/[id]/actions.ts", "utf8");
ok(leadActions.includes('revalidatePath("/console/leads/[id]", "page")'),
   'lead actions must revalidate the literal "/console/leads/[id]" with the "page" kind');
ok(!/revalidatePath\(`\/console\/leads\/\$\{/.test(leadActions),
   "revalidatePath must not interpolate a lead id: that invalidates only one lead");
console.log("ok dynamic-segment revalidation uses the literal bracket form");

// RPC argument names must match the migration's declarations exactly, or
// PostgREST answers 404 "function not found" at runtime.
const sql = readFileSync("supabase/migrations/0006_authorize_lead_writes.sql", "utf8");
const teamActions = readFileSync("app/console/team/actions.ts", "utf8");
for (const [fn, args] of [
  ["set_teammate_role", ["p_profile_id", "p_role"]],
  ["remove_teammate", ["p_profile_id", "p_reassign_to"]],
] as const) {
  ok(sql.includes(`function public.${fn}(`), `0006 no longer defines ${fn}`);
  ok(teamActions.includes(`"${fn}"`), `team actions no longer call ${fn}`);
  for (const arg of args) {
    ok(sql.includes(arg), `${fn} in 0006 no longer declares ${arg}`);
    ok(teamActions.includes(`${arg}:`),
       `team actions do not pass ${arg} to ${fn}; PostgREST will 404 the call`);
  }
}
console.log("ok RPC argument names match the migration");

if (fails) { console.log(`\n${fails} check(s) failed`); process.exit(1); }
console.log("check-actions: pass");
