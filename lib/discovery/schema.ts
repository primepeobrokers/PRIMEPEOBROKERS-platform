/*
 * The six-step discovery schema — single source of truth for the flow UI,
 * client and server validation, the review screen, and the console detail view.
 * Field definitions and copy come from the approved design.
 */

export type FieldType = "text" | "num" | "area" | "radio" | "chips";

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  /** max-width of the input, e.g. "180px" */
  w?: string;
  required?: boolean;
  /** whole numbers only */
  int?: boolean;
  /** YYYY-MM-DD */
  date?: boolean;
  email?: boolean;
  /** render in mono font */
  mono?: boolean;
  /** currency field — show $ formatting in summaries */
  prefix?: boolean;
  /** radio options: [value, label, note] */
  options?: string[] | [string, string, string][];
  /** chips act as single-select */
  single?: boolean;
}

export interface StepDef {
  title: string;
  intro: string;
  /** field whose value summarises the step in the ledger */
  key: string;
  sensitive?: boolean;
  summaryFmt?: (v: AnswerValue) => string;
  fields: FieldDef[];
}

export type AnswerValue = string | string[] | undefined;
export type Answers = Record<string, AnswerValue>;

export const STEPS: StepDef[] = [
  {
    title: "Company basics",
    intro:
      "Legal detail only. Nothing here is a commitment, and none of it is shared yet.",
    key: "legal",
    fields: [
      {
        id: "legal",
        type: "text",
        label: "Legal entity name",
        help: "As it appears on your payroll filings.",
        w: "460px",
        required: true,
      },
      {
        id: "states",
        type: "chips",
        label: "States you employ people in",
        help: "Multi-state filings change which models are available to you.",
        options: ["CA", "NY", "TX", "IL", "FL", "WA", "MA", "CO", "GA", "Other"],
        required: true,
      },
      {
        id: "entity",
        type: "radio",
        label: "Entity type",
        options: [
          ["llc", "LLC", ""],
          ["ccorp", "C-corp", ""],
          ["scorp", "S-corp", ""],
          ["other", "Something else", ""],
        ],
        required: true,
      },
      {
        id: "ranBefore",
        type: "radio",
        label: "Have you run payroll before?",
        options: [
          ["yes", "Yes, currently running payroll", ""],
          ["lapsed", "Yes, but not right now", ""],
          ["no", "No, first hires", ""],
        ],
        required: true,
      },
    ],
  },
  {
    title: "Headcount & growth",
    intro:
      "Approximate is fine. Every model in this market prices off these four numbers.",
    key: "fte",
    summaryFmt: (v) => `${v} FTE`,
    fields: [
      {
        id: "fte",
        type: "num",
        label: "Full-time employees",
        help: "W-2, 30+ hours.",
        w: "180px",
        required: true,
        int: true,
      },
      {
        id: "pt",
        type: "num",
        label: "Part-time employees",
        help: "W-2, under 30 hours.",
        w: "180px",
        int: true,
      },
      {
        id: "contractors",
        type: "num",
        label: "Contractors (1099)",
        help: "Counted separately — classification affects eligibility.",
        w: "180px",
        int: true,
      },
      {
        id: "growth",
        type: "chips",
        label: "Headcount in twelve months",
        help: "Your honest expectation, not a target.",
        options: ["Flat", "+10–25%", "+25–50%", "+50–100%", "Shrinking"],
        single: true,
        required: true,
      },
    ],
  },
  {
    title: "Current payroll & HR",
    intro:
      "What you have today, and what it costs. If you are unsure of the fee, give a range.",
    key: "provider",
    fields: [
      {
        id: "provider",
        type: "radio",
        label: "Who runs payroll today",
        options: [
          ["bundled", "Bundled PEO", "all-in"],
          ["bureau", "Payroll bureau", "payroll only"],
          ["hris", "HRIS + external broker", "two vendors"],
          ["inhouse", "In-house / accountant", ""],
        ],
        required: true,
      },
      {
        id: "fee",
        type: "num",
        label: "What you pay them a year",
        help: "Admin and service fees, excluding insurance premium.",
        w: "220px",
        prefix: true,
        required: true,
      },
      {
        id: "bundled",
        type: "chips",
        label: "What is bundled in that",
        options: [
          "Payroll",
          "Benefits admin",
          "Workers' comp",
          "Compliance filings",
          "HR advice",
          "Time tracking",
        ],
      },
      {
        id: "contractEnd",
        type: "text",
        label: "Contract end date",
        help: "YYYY-MM-DD. This decides how much runway a comparison has.",
        w: "200px",
        mono: true,
        date: true,
        required: true,
      },
    ],
  },
  {
    title: "Benefits & compensation",
    intro:
      "Bands, not individual salaries. We never ask for a name attached to a number.",
    key: "spend",
    sensitive: true,
    summaryFmt: (v) => "$" + Number(v || 0).toLocaleString("en-US"),
    fields: [
      {
        id: "medical",
        type: "radio",
        label: "Medical plan today",
        options: [
          ["ppo", "PPO", ""],
          ["hdhp", "HDHP + HSA", ""],
          ["hmo", "HMO", ""],
          ["none", "No medical plan", ""],
        ],
        required: true,
      },
      {
        id: "retirement",
        type: "radio",
        label: "Retirement",
        options: [
          ["match", "401(k) with match", ""],
          ["nomatch", "401(k), no match", ""],
          ["none", "Nothing yet", ""],
        ],
        required: true,
      },
      {
        id: "bands",
        type: "chips",
        label: "Salary bands in use",
        help: "Select every band you currently pay into.",
        options: ["< $60k", "$60–90k", "$90–130k", "$130–180k", "$180k+"],
        required: true,
      },
      {
        id: "spend",
        type: "num",
        label: "Total benefits spend a year",
        help: "Employer share of premium and contributions.",
        w: "220px",
        prefix: true,
        required: true,
      },
    ],
  },
  {
    title: "Pain points & priorities",
    intro: "This is the part a broker reads first. Blunt is useful.",
    key: "broke",
    fields: [
      {
        id: "broke",
        type: "chips",
        label: "What has gone wrong",
        options: [
          "Renewal increase",
          "Support response time",
          "Payroll errors",
          "Compliance gap",
          "Bad reporting",
          "Plan quality",
          "Nothing yet",
        ],
      },
      {
        id: "nonNeg",
        type: "area",
        label: "What you will not compromise on",
        help: "One or two lines.",
        placeholder: "e.g. Our current medical network — people picked us for it.",
      },
      {
        id: "tradeoff",
        type: "radio",
        label: "What you would trade for a lower rate",
        options: [
          ["service", "Slower service, same plans", ""],
          ["plans", "Narrower plans, same service", ""],
          ["admin", "More admin work in-house", ""],
          ["nothing", "Nothing — price is not the issue", ""],
        ],
        required: true,
      },
    ],
  },
  {
    title: "Contact details",
    intro: "The only step that asks about you rather than the company.",
    key: "name",
    fields: [
      { id: "name", type: "text", label: "Your name", w: "340px", required: true },
      {
        id: "email",
        type: "text",
        label: "Work email",
        help: "Your record and the resume link go here.",
        w: "340px",
        email: true,
        required: true,
      },
      {
        id: "phone",
        type: "num",
        label: "Phone",
        help: "Optional. Only used if the record is ambiguous.",
        w: "220px",
      },
      {
        id: "role",
        type: "radio",
        label: "Your role",
        options: [
          ["founder", "Founder / CEO", ""],
          ["ops", "Ops / Finance", ""],
          ["hr", "HR / People", ""],
          ["other", "Other", ""],
        ],
        required: true,
      },
    ],
  },
];

export const TOTAL_STEPS = STEPS.length;

export function isEmptyValue(v: AnswerValue): boolean {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Returns an error message, or "" when the field is valid. */
export function validateField(field: FieldDef, answers: Answers): string {
  const v = answers[field.id];
  const empty = isEmptyValue(v);
  if (field.required && empty) {
    return field.type === "chips"
      ? "Pick at least one. If none apply, choose Other."
      : "This one is needed before the next step.";
  }
  if (empty) return "";
  if (field.int && !/^\d+$/.test(String(v)))
    return "Whole numbers only — no commas or ranges.";
  if (field.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
    return "Use YYYY-MM-DD, e.g. 2027-01-31.";
  if (field.email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v)))
    return "That address is missing an @ or a domain.";
  return "";
}

/** Validates one step. Returns a map of field id → error for invalid fields. */
export function validateStep(stepIndex: number, answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of STEPS[stepIndex].fields) {
    const e = validateField(field, answers);
    if (e) errors[field.id] = e;
  }
  return errors;
}

/**
 * Strips unknown keys and coerces values to the shape the schema expects.
 * Server-side guard so arbitrary JSON never lands in the database.
 */
export function sanitizeAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== "object" || raw === null) return out;
  const input = raw as Record<string, unknown>;
  for (const step of STEPS) {
    for (const field of step.fields) {
      const v = input[field.id];
      if (v === undefined || v === null) continue;
      if (field.type === "chips" && !field.single) {
        if (Array.isArray(v)) {
          out[field.id] = v
            .filter((x): x is string => typeof x === "string")
            .slice(0, 20)
            .map((x) => x.slice(0, 200));
        }
      } else if (typeof v === "string") {
        out[field.id] = v.slice(0, 2000);
      }
    }
  }
  return out;
}

/** Human-readable value for review/console/email surfaces. */
export function formatAnswer(fieldId: string, answers: Answers): string {
  const v = answers[fieldId];
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (!v) return "—";
  if (fieldId === "fee" || fieldId === "spend")
    return "$" + Number(v).toLocaleString("en-US");
  const field = STEPS.flatMap((s) => s.fields).find((f) => f.id === fieldId);
  if (field?.type === "radio" && Array.isArray(field.options)) {
    const opt = (field.options as [string, string, string][]).find(
      (o) => o[0] === v,
    );
    return opt ? opt[1] : String(v);
  }
  return String(v);
}

/** Ledger summary for a completed step. */
export function stepSummary(stepIndex: number, answers: Answers): string {
  const step = STEPS[stepIndex];
  const v = answers[step.key];
  if (isEmptyValue(v)) return "—";
  if (step.summaryFmt) return step.summaryFmt(v);
  return formatAnswer(step.key, answers);
}
