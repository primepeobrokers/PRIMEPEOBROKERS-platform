import {
  STEPS, TOTAL_STEPS, CATEGORIES, visibleFields, validateStep,
  type Answers, type Category,
} from "../lib/discovery/schema";

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("  FAIL: " + m); fails++; } };

// Fields that must never appear for these categories.
const FORBIDDEN: Record<string, string[]> = {
  payroll:     ["benefitTypes", "benefitsPlatform", "spend", "atsNeeded", "backgroundChecks"],
  hris:        ["payrollComplexity", "payrollFrequency", "atsNeeded"],
  recruiting:  ["payrollComplexity", "payrollFrequency", "benefitTypes", "spend"],
  performance: ["payrollComplexity", "payrollFrequency", "benefitTypes", "spend", "atsNeeded"],
  learning:    ["payrollComplexity", "payrollFrequency", "benefitTypes", "spend", "atsNeeded"],
};

console.log("Steps:", TOTAL_STEPS, STEPS.map(s => s.title).join(" | "));

for (const cat of CATEGORIES) {
  const id = cat.id as Category;
  // Answer every visible required field, walking steps in order so that
  // conditional fields unlock exactly as they do in the UI.
  const a: Answers = { category: id };
  const seen = new Set<string>();
  for (let i = 0; i < TOTAL_STEPS; i++) {
    for (let pass = 0; pass < 3; pass++) {
      for (const f of visibleFields(i, a)) {
        seen.add(f.id);
        if (a[f.id] !== undefined) continue;
        if (f.type === "check") a[f.id] = [String((f.options as string[])[0])];
        else if (f.type === "chips") a[f.id] = f.single ? String((f.options as string[])[0]) : [String((f.options as string[])[0])];
        else if (f.type === "radio") a[f.id] = (f.options as [string,string,string][])[0][0];
        else if (f.type === "num") a[f.id] = "42";
        else if (f.id === "email") a[f.id] = "x@y.com";
        else if (f.id === "renewalDate") a[f.id] = "2027-01-31";
        else a[f.id] = "test";
      }
    }
  }

  // 1. Every step must validate clean once its visible fields are answered.
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const errs = validateStep(i, a);
    ok(Object.keys(errs).length === 0,
       `${id} step ${i + 1} (${STEPS[i].title}) had errors: ${JSON.stringify(errs)}`);
  }

  // 2. Forbidden fields must never have been shown.
  for (const bad of FORBIDDEN[id] ?? []) {
    ok(!seen.has(bad), `${id} was shown "${bad}" but should not be`);
  }

  // 3. Recruiting must get its ATS questions.
  if (id === "recruiting") {
    for (const need of ["atsNeeded", "backgroundChecks", "jobPostingChannels", "onboardingFeatures"]) {
      ok(seen.has(need), `recruiting missing "${need}"`);
    }
  }

  // 4. Everyone gets the add-on quote checkboxes.
  ok(seen.has("alsoQuote"), `${id} missing the alsoQuote checkboxes`);

  console.log(`${fails === 0 ? "ok" : "  "} ${cat.name.padEnd(12)} ${seen.size} fields`);
}

// 5. A category-less visitor must still be blocked at step 1.
const empty: Answers = {};
ok(Object.keys(validateStep(0, empty)).length === 1, "step 1 should require a category");

// 6. Category-only fields must not leak when no category is chosen.
const noCat = visibleFields(3, empty).map(f => f.id);
ok(!noCat.includes("atsNeeded"), "atsNeeded leaked with no category chosen");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
