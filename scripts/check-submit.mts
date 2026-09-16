/**
 * The server revalidates every step in submitRecord(). If it disagreed with
 * the UI about which fields exist, a lead that looked complete in the browser
 * would be rejected on submit. This checks the two agree for every category,
 * and that sanitizeAnswers does not drop the new checkbox arrays.
 */
import {
  TOTAL_STEPS, CATEGORIES, visibleFields, validateStep, sanitizeAnswers,
  type Answers, type Category,
} from "../lib/discovery/schema";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

for (const cat of CATEGORIES) {
  const a: Answers = { category: cat.id as Category };
  for (let i = 0; i < TOTAL_STEPS; i++)
    for (let pass = 0; pass < 3; pass++)
      for (const f of visibleFields(i, a)) {
        if (a[f.id] !== undefined) continue;
        if (f.type === "check") a[f.id] = [String((f.options as string[])[0])];
        else if (f.type === "chips") a[f.id] = f.single ? String((f.options as string[])[0]) : [String((f.options as string[])[0])];
        else if (f.type === "radio") a[f.id] = (f.options as [string,string,string][])[0][0];
        else if (f.type === "num") a[f.id] = "42";
        else if (f.id === "email") a[f.id] = "x@y.com";
        else if (f.date) a[f.id] = "2027-01-31";
        else a[f.id] = "test";
      }

  // Round-trip through the server sanitiser, as submitRecord does.
  const clean = sanitizeAnswers(JSON.parse(JSON.stringify(a)));
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const errs = validateStep(i, clean);
    ok(Object.keys(errs).length === 0,
       `${cat.id} rejected server-side at step ${i + 1}: ${JSON.stringify(errs)}`);
  }
  // Arrays must survive the sanitiser.
  ok(Array.isArray(clean.alsoQuote), `${cat.id}: alsoQuote lost its array shape`);
  ok(clean.category === cat.id, `${cat.id}: category did not survive sanitising`);
  console.log(`ok ${cat.name.padEnd(12)} submits clean`);
}

// Junk must not survive.
const junk = sanitizeAnswers({ category: "peo", evil: "<script>", fte: { nested: 1 } });
ok(junk.evil === undefined, "unknown key survived sanitising");
ok(junk.fte === undefined, "non-string value survived sanitising");
console.log("ok sanitiser drops unknown keys and bad shapes");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
