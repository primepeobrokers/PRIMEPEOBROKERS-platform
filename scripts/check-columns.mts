/**
 * The console projects submissions through a hand-written select list, and
 * SubmissionRow has to match it exactly. TypeScript cannot check a string
 * against an interface, so a column typo reaches production as a PostgREST
 * error rather than a build failure, and a missing column reaches it as an
 * undefined field.
 *
 * The compile-time half of this lives in lib/console/columns.ts as the
 * SUBMISSION_ROW_KEYS witness, which fails to build if the interface gains a
 * field the tuple does not have. This script covers the other direction, plus
 * the shape of the generated select strings.
 */
import {
  SUBMISSION_LIST_COLUMNS,
  SUBMISSION_LIST_SELECT,
  SUBMISSION_DETAIL_SELECT,
  SUBMISSION_ROW_KEYS,
  MEMBER_SELECT,
  memberName,
  type Member,
} from "../lib/console/columns";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

const cols = [...SUBMISSION_LIST_COLUMNS];
const keys = Object.keys(SUBMISSION_ROW_KEYS);

// Every projected column must be a field on the row type.
for (const c of cols) {
  ok(keys.includes(c), `column "${c}" is selected but missing from SubmissionRow`);
}
// And the reverse, which the witness already enforces at build time. Asserted
// again so a future refactor of the witness cannot quietly drop the guarantee.
for (const k of keys) {
  ok(cols.includes(k as (typeof SUBMISSION_LIST_COLUMNS)[number]),
     `SubmissionRow has "${k}" but it is not selected`);
}

ok(new Set(cols).size === cols.length, "duplicate column in SUBMISSION_LIST_COLUMNS");

// The witness must map each key to itself, or the two sides can drift while
// still type-checking.
for (const [k, v] of Object.entries(SUBMISSION_ROW_KEYS)) {
  ok(k === v, `SUBMISSION_ROW_KEYS maps "${k}" to "${v}"; it must map to itself`);
}

// Select strings are what actually reach PostgREST.
ok(!SUBMISSION_LIST_SELECT.includes(",,"), "list select has an empty column");
ok(!/,\s*$/.test(SUBMISSION_LIST_SELECT), "list select has a trailing comma");
ok(SUBMISSION_DETAIL_SELECT.endsWith(", answers"),
   "detail select must add answers to the list columns");
ok(SUBMISSION_DETAIL_SELECT.startsWith(SUBMISSION_LIST_SELECT),
   "detail select must be a superset of the list select");
for (const c of cols) {
  ok(SUBMISSION_LIST_SELECT.split(", ").includes(c),
     `column "${c}" is not comma-space separated in the select string`);
}

// The two Phase 2 columns specifically: these are the reason this exists.
ok(cols.includes("lead_stage"), "lead_stage must be projected for the stage badge");
ok(cols.includes("assigned_to"), "assigned_to must be projected for the assignee cell");

// Roster select and display fallbacks.
for (const f of ["id", "full_name", "email", "role", "deactivated_at"]) {
  ok(MEMBER_SELECT.split(", ").includes(f), `MEMBER_SELECT is missing "${f}"`);
}
const named: Member = { id: "1", full_name: "Dana Whitfield", email: "d@x.com", role: "admin", deactivated_at: null };
ok(memberName(named) === "Dana Whitfield", "memberName should prefer full_name");
ok(memberName({ ...named, full_name: "  " }) === "d@x.com",
   "memberName should fall back to email when the name is blank");
ok(memberName({ ...named, full_name: null, email: null }) === "Unknown",
   "memberName should fall back to Unknown");
ok(memberName(null) === "Unassigned", "memberName(null) should read Unassigned");

console.log(`ok ${cols.length} columns, row type and select strings agree`);

if (fails) { console.log(`\n${fails} check(s) failed`); process.exit(1); }
console.log("check-columns: pass");
