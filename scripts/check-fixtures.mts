/**
 * Does the integration suite's cleanup actually cover the fixtures it writes?
 *
 * WHY THIS EXISTS. The teardown deleted audit rows matching "ZZ Test", and a
 * comment above it asserted that every fixture row carries that string. It
 * did not: the same script also writes "ZZ Lead", "ZZ Partner A",
 * "ZZ Partner B" and "ZZ Uninvited". Those rows were never cleaned up and
 * accumulated in the client's own Team activity feed, where seven of them
 * made the page read as a broken system until they were removed by hand.
 *
 * The failure was silent in the worst way: the tests passed, the cleanup
 * reported success, and the residue only showed up on a screen a client was
 * looking at. So this asserts the relationship the comment claimed, by
 * reading both sides out of the source rather than trusting either.
 *
 * Pure static analysis: no credentials, no network, safe in `pnpm check`.
 */
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) { console.log("  FAIL: " + m); fails++; }
};

const src = readFileSync("scripts/test-integration.mts", "utf8");

// ---------------------------------------------------------------------------
// 1. Every fixture name the script writes, as it appears in the source.
// ---------------------------------------------------------------------------
/*
  Matches the literal names in template strings and plain strings alike:
  `ZZ Test ${email}`, "ZZ Partner A", `ZZ Lead ${n}`. The capture stops at
  the first interpolation or quote, which is what a LIKE prefix would see.

  Comments are stripped first. Without that this scans its own explanatory
  prose (which necessarily quotes the fixture names it is describing) and
  reports a phantom fixture called "ZZ" from a sentence about the "ZZ "
  prefix. A checker that reads the comments about the code rather than the
  code is worse than no checker: it fails on writing, not on behaviour.
*/
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const names = [...code.matchAll(/["'`](ZZ [^"'`$]*)/g)]
  .map((m) => m[1]!.trim())
  // The cleanup patterns themselves are not fixture names.
  .filter((v) => !v.includes("%"));
const unique = [...new Set(names)];

ok(unique.length > 0, "found no ZZ-prefixed fixture names, so this check is not looking at anything");

// ---------------------------------------------------------------------------
// 2. The cleanup patterns actually used against tenant_events.
// ---------------------------------------------------------------------------
const patterns = [
  ...src.matchAll(/from\("tenant_events"\)\s*\.delete\(\)\s*\.ilike\(\s*"(\w+)"\s*,\s*"([^"]+)"/g),
].map((m) => ({ column: m[1]!, pattern: m[2]! }));

ok(patterns.length > 0, "no tenant_events cleanup found in the teardown");

/** Turns a SQL LIKE pattern into the prefix it actually requires. */
const prefixOf = (p: string) => p.replace(/%.*$/, "");

// ---------------------------------------------------------------------------
// 3. Every fixture name must be covered by at least one cleanup pattern.
// ---------------------------------------------------------------------------
for (const name of unique) {
  const covered = patterns.some((p) =>
    name.toLowerCase().startsWith(prefixOf(p.pattern).toLowerCase()),
  );
  ok(
    covered,
    `fixture name "${name}" is written by the suite but no tenant_events cleanup ` +
      `pattern matches it (${patterns.map((p) => `${p.column} ilike "${p.pattern}"`).join(", ")}). ` +
      `Rows like this survive the run and appear in the client's activity feed.`,
  );
}

// ---------------------------------------------------------------------------
// 4. The pattern must stay anchored, so it cannot sweep up real history.
// ---------------------------------------------------------------------------
for (const p of patterns) {
  ok(
    !p.pattern.startsWith("%"),
    `cleanup pattern "${p.pattern}" is unanchored: a leading % matches anywhere ` +
      `in the string and could delete real audit rows that merely contain it.`,
  );
  ok(
    prefixOf(p.pattern).trim().length >= 2,
    `cleanup pattern "${p.pattern}" is too broad to be safe against real data.`,
  );
}

if (fails === 0) {
  console.log(`  ${unique.length} fixture names, all covered by ${patterns.length} anchored cleanup patterns`);
}
console.log(fails === 0 ? "check-fixtures: pass" : `check-fixtures: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
