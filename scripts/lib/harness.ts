import { readFileSync } from "node:fs";

/**
 * A minimal assertion harness, shared by the check-* and test-* scripts.
 *
 * WHY NOT VITEST OR JEST
 *
 * The project has no test runner and six existing scripts that each roll their
 * own `ok()`. Adding a runner would mean a config, a transform pipeline, and a
 * dependency, to gain watch mode and a prettier reporter for suites that run in
 * under a second. What the existing scripts lack is not a runner but shared
 * structure: grouping, a summary, and a non-zero exit. That is this file.
 *
 * Everything here is synchronous-friendly and dependency-free so it keeps
 * working under `npx tsx` with no build step.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

export interface Failure {
  group: string;
  message: string;
  detail?: string;
}

const failures: Failure[] = [];
const skipped: string[] = [];
let passed = 0;
let group = "";

/** Starts a named group. Printed once, with its results underneath. */
export function describe(name: string) {
  group = name;
  console.log(`\n${BOLD}${name}${RESET}`);
}

/**
 * Asserts a condition.
 *
 * `detail` is for the value that made it fail: a message saying what should
 * have happened is much less useful than one showing what did.
 */
export function ok(condition: boolean, message: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ${GREEN}pass${RESET} ${message}`);
  } else {
    failures.push({ group, message, detail });
    console.log(`  ${RED}FAIL${RESET} ${message}`);
    if (detail) console.log(`       ${DIM}${detail}${RESET}`);
  }
  return condition;
}

/**
 * Asserts equality, reporting both sides on failure.
 *
 * `note` appends caller context to the failure detail. It exists for the case
 * where the interesting fact is not the mismatch itself but HOW the write was
 * refused: a PostgREST update that RLS filtered returns no error and zero
 * rows, so "blocked with 42501" and "silently discarded" look identical from
 * the value alone.
 */
export function equal<T>(actual: T, expected: T, message: string, note?: string) {
  if (actual === expected) return ok(true, message);
  const detail = `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  return ok(false, message, note ? `${detail} ${note}` : detail);
}

/**
 * Records a test that could not run, rather than passing it.
 *
 * A skipped test that reports "pass" is worse than no test: it tells you a
 * property holds when nobody checked. These are listed separately in the
 * summary and never affect the exit code.
 */
export function skip(message: string, why: string) {
  skipped.push(`${message} (${why})`);
  console.log(`  ${YELLOW}skip${RESET} ${message} ${DIM}- ${why}${RESET}`);
}

/** Prints the summary and exits non-zero if anything failed. */
export function done(suite: string): never {
  console.log(`\n${BOLD}${suite}${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}` +
    (failures.length ? `, ${RED}${failures.length} failed${RESET}` : "") +
    (skipped.length ? `, ${YELLOW}${skipped.length} skipped${RESET}` : ""));

  if (skipped.length) {
    console.log(`\n${YELLOW}Skipped:${RESET}`);
    for (const s of skipped) console.log(`  - ${s}`);
  }

  if (failures.length) {
    console.log(`\n${RED}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  ${f.group} :: ${f.message}`);
      if (f.detail) console.log(`      ${f.detail}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

/**
 * Reads .env.local into a plain object. No dependency, no side effects.
 *
 * A static import of node:fs, not require(): this is an ESM module, so
 * require is not defined and calling it throws ReferenceError. That throw was
 * originally caught by a bare `catch {}` here, which turned "the loader is
 * broken" into "there is no env file" and skipped the entire integration
 * suite while reporting success. Only ENOENT is tolerated now; anything else
 * propagates.
 */
export function loadEnv(path = ".env.local"): Record<string, string> {
  const env: Record<string, string> = {};
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return env;
    throw e;
  }
  for (const line of contents.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
