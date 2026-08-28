/*
 * The six-step discovery schema: single source of truth for the flow UI,
 * client and server validation, the review screen, and the console detail view.
 *
 * Step 1 is a category choice. Everything after it is filtered by that choice,
 * so a Payroll visitor never sees the deep benefits questions and an HRIS
 * visitor never sees payroll complexity. The filtering lives in visibleFields()
 * and is used by the UI, by validateStep(), and by the server revalidation in
 * submitRecord(), so those three can never disagree about which fields exist.
 */

export type FieldType =
  | "text"
  | "num"
  | "area"
  | "radio"
  | "chips"
  | "check"
  | "cards";

/** The product categories a visitor can shop for. */
export const CATEGORIES = [
  {
    id: "peo",
    icon: "\u{1F3E2}",
    name: "PEO",
    desc: "Co-employment, bundled payroll, HR & compliance",
  },
  {
    id: "payroll",
    icon: "\u{1F4B5}",
    name: "Payroll",
    desc: "Payroll processing, tax filing, and wage management",
  },
  {
    id: "hris",
    icon: "\u{1F465}",
    name: "HRIS",
    desc: "Core HR management and employee records",
  },
  {
    id: "recruiting",
    icon: "\u{2705}",
    name: "Recruiting",
    desc: "ATS, sourcing, and hiring workflows",
  },
  {
    id: "performance",
    icon: "\u{1F4CA}",
    name: "Performance",
    desc: "Reviews, goals, and feedback",
  },
  {
    id: "learning",
    icon: "\u{1F4D8}",
    name: "Learning",
    desc: "LMS, training, and employee development",
  },
] as const;

export type Category = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as readonly string[];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && CATEGORY_IDS.includes(v);
}

export function categoryName(id: string | undefined): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? "";
}

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
  /** currency field: show $ formatting in summaries */
  prefix?: boolean;
  /** radio options: [value, label, note] */
  options?: string[] | [string, string, string][];
  /** chips act as single-select */
  single?: boolean;
  /** show only for these categories. Absent means every category. */
  only?: Category[];
  /** hide for these categories. */
  not?: Category[];
  /** show only when another field holds one of these values */
  when?: { field: string; is: string[] };
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
    title: "What are you evaluating?",
    intro:
      "Pick a category. You will walk through a structured needs assessment, we benchmark your spend, and we match you against the market.",
    key: "category",
    fields: [
      {
        id: "category",
        type: "cards",
        label: "Choose your category",
        required: true,
      },
    ],
  },
  {
    title: "About you and your company",
    intro:
      "Who is running this, and the company it is for. Size and footprint shape every recommendation.",
    key: "company",
    fields: [
      {
        id: "fullName",
        type: "text",
        label: "Your name",
        w: "340px",
        required: true,
      },
      {
        id: "email",
        type: "text",
        label: "Work email",
        help: "Your record and the resume link go here.",
        w: "380px",
        required: true,
        email: true,
      },
      {
        id: "phone",
        type: "text",
        label: "Phone",
        help: "Optional. Only used if the record is ambiguous.",
        w: "220px",
      },
      {
        id: "jobTitle",
        type: "text",
        label: "Job title",
        placeholder: "VP of HR",
        w: "300px",
      },
      {
        id: "decisionRole",
        type: "radio",
        label: "Your role in the decision",
        options: [
          ["decider", "Final decision-maker", ""],
          ["influencer", "Key influencer", ""],
          ["evaluator", "Evaluator / researcher", ""],
          ["it", "IT / technical lead", ""],
        ],
        required: true,
      },
      {
        id: "company",
        type: "text",
        label: "Company name",
        help: "As it appears on your payroll filings.",
        w: "460px",
        required: true,
      },
      {
        id: "website",
        type: "text",
        label: "Website",
        placeholder: "acme.com",
        w: "300px",
      },
      {
        id: "industry",
        type: "text",
        label: "Industry",
        placeholder: "Healthcare, SaaS, retail...",
        w: "300px",
      },
      {
        id: "employeeCount",
        type: "chips",
        label: "Employee count",
        single: true,
        options: ["1-25", "26-100", "101-500", "501-2,000", "2,000+"],
        required: true,
      },
      {
        id: "geography",
        type: "chips",
        label: "Geography",
        single: true,
        options: [
          "Single state",
          "Multi-state US",
          "US + Canada",
          "North America",
          "Global",
        ],
        required: true,
      },
      {
        id: "states",
        type: "text",
        label: "Which states do you employ people in?",
        help: "Multi-state filings change which models are available to you.",
        placeholder: "TX, CA, NY...",
        w: "460px",
      },
    ],
  },
  {
    title: "Workforce & payroll",
    intro:
      "How your people are classified and paid drives most of the pricing. Answer what you know: anything you skip, your advisor picks up on the call.",
    key: "fte",
    summaryFmt: (v) => (v ? `${v} FTE` : "–"),
    fields: [
      {
        id: "employeeTypes",
        type: "check",
        label: "Employee types",
        help: "Select all that apply.",
        options: [
          "Full-time",
          "Part-time",
          "Hourly",
          "Salaried",
          "Seasonal",
          "1099",
        ],
        required: true,
      },
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
        help: "Counted separately: classification affects eligibility.",
        w: "180px",
        int: true,
      },
      {
        id: "provider",
        type: "text",
        label: "Current PEO or payroll provider",
        placeholder: "TriNet, ADP, Gusto, spreadsheets...",
        w: "380px",
      },
      {
        id: "accountingSoftware",
        type: "text",
        label: "Accounting software",
        placeholder: "QuickBooks, NetSuite...",
        w: "300px",
      },
      {
        id: "payrollFrequency",
        type: "chips",
        label: "Payroll frequency",
        single: true,
        options: ["Weekly", "Bi-weekly", "Semi-monthly", "Monthly"],
        not: ["hris", "recruiting", "performance", "learning"],
      },
      {
        id: "payrollComplexity",
        type: "check",
        label: "Payroll complexity",
        help: "Select all that apply.",
        options: [
          "Overtime",
          "Bonuses",
          "Commissions",
          "Job costing",
          "Multi-state",
          "Tips",
          "Prevailing wage",
          "Certified payroll",
          "Shift differentials",
        ],
        not: ["hris", "recruiting", "performance", "learning"],
      },
      {
        id: "fee",
        type: "num",
        label: "What you pay them a year",
        help: "Admin and service fees, excluding insurance premium. A range is fine.",
        w: "220px",
        prefix: true,
      },
    ],
  },
  {
    title: "Time, HR and benefits",
    intro:
      "What you need the platform to actually do, and what you offer today. Bands, not individual salaries.",
    key: "benefitTypes",
    sensitive: true,
    fields: [
      {
        id: "timeTracking",
        type: "radio",
        label: "Do you need time tracking?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
        ],
      },
      {
        id: "timeTrackingMethods",
        type: "check",
        label: "Time tracking methods",
        help: "Select all that apply.",
        options: [
          "Physical clock",
          "Mobile",
          "Web",
          "Supervisor approval",
          "Scheduling",
          "Job costing",
        ],
        when: { field: "timeTracking", is: ["yes"] },
      },
      {
        id: "hrNeeds",
        type: "check",
        label: "HR support you need",
        help: "Select all that apply.",
        options: [
          "PTO tracking & time-off requests",
          "Performance management",
          "LMS / employee training",
          "Certification tracking",
        ],
      },
      {
        id: "internalHrTeam",
        type: "radio",
        label: "Do you have an internal HR team?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
        ],
      },
      {
        id: "atsNeeded",
        type: "radio",
        label: "Do you need an ATS?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
          ["unsure", "Not sure", ""],
        ],
        only: ["recruiting"],
      },
      {
        id: "backgroundChecks",
        type: "radio",
        label: "Background checks needed?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
        ],
        only: ["recruiting"],
      },
      {
        id: "jobPostingChannels",
        type: "text",
        label: "Where do you post job openings today?",
        placeholder: "LinkedIn, Indeed, referrals...",
        w: "380px",
        only: ["recruiting"],
      },
      {
        id: "onboardingFeatures",
        type: "check",
        label: "Onboarding features",
        help: "Select all that apply.",
        options: [
          "Offer letters",
          "E-sign",
          "I-9",
          "W-4",
          "Direct deposit",
          "Acknowledgements",
          "None",
        ],
        only: ["recruiting", "hris", "peo"],
      },
      {
        id: "benefitsOffered",
        type: "radio",
        label: "Do you offer benefits today?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
        ],
        required: true,
      },
      {
        id: "benefitTypes",
        type: "check",
        label: "What is offered",
        help: "Select all that apply.",
        options: [
          "Medical",
          "Dental",
          "Vision",
          "Life",
          "Disability",
          "401(k)",
          "HSA / FSA",
          "None",
        ],
        not: ["payroll", "recruiting", "performance", "learning"],
        when: { field: "benefitsOffered", is: ["yes"] },
      },
      {
        id: "benefitsPlatform",
        type: "text",
        label: "Benefits platform",
        placeholder: "EENav, bswift, N/A...",
        w: "300px",
        not: ["payroll", "recruiting", "performance", "learning"],
        when: { field: "benefitsOffered", is: ["yes"] },
      },
      {
        id: "benefitsBroker",
        type: "text",
        label: "Benefits broker, if any",
        placeholder: "Firm name",
        w: "300px",
        not: ["payroll", "recruiting", "performance", "learning"],
      },
      {
        id: "spend",
        type: "num",
        label: "Total benefits spend a year",
        help: "Employer share of premium and contributions. A range is fine.",
        w: "220px",
        prefix: true,
        not: ["payroll", "recruiting", "performance", "learning"],
        when: { field: "benefitsOffered", is: ["yes"] },
      },
      {
        id: "hrGuidance",
        type: "radio",
        label: "Interested in HR expert guidance and support?",
        options: [
          ["yes", "Yes", ""],
          ["no", "No", ""],
          ["exploring", "Exploring", ""],
        ],
      },
      {
        id: "managedServices",
        type: "check",
        label: "If yes, what kind?",
        help: "Select all that apply.",
        options: ["Managed payroll", "Managed HR support", "Managed benefits"],
        when: { field: "hrGuidance", is: ["yes", "exploring"] },
      },
    ],
  },
  {
    title: "Your search",
    intro:
      "What is driving this, and what you want priced. This is the part a broker reads first.",
    key: "drivers",
    fields: [
      {
        id: "drivers",
        type: "check",
        label: "Primary reason for evaluating",
        help: "Select all that apply.",
        options: [
          "Cost",
          "Service",
          "Compliance",
          "Growth",
          "Tech limits",
          "Leaving a PEO",
        ],
        required: true,
      },
      {
        id: "alsoQuote",
        type: "check",
        label: "Which of these would you also like quoted?",
        help: "Select all that apply. Anything you already have, we will benchmark against the market.",
        options: [
          "Payroll",
          "Benefits administration",
          "Time & attendance",
          "401(k)",
          "Workers' comp",
          "ATS / recruiting",
          "Performance management",
          "LMS / training",
          "HR advisory",
        ],
      },
      {
        id: "techStack",
        type: "check",
        label: "Current HR tech stack",
        help: "Select all that apply.",
        options: [
          "ADP",
          "Paychex",
          "Gusto",
          "Rippling",
          "Paylocity",
          "Paycom",
          "None / Manual",
          "Other",
        ],
      },
      {
        id: "integrations",
        type: "check",
        label: "Required integrations",
        help: "Select all that apply.",
        options: ["Accounting", "Benefits", "Time", "ATS", "401(k)"],
      },
      {
        id: "timeline",
        type: "chips",
        label: "Target implementation timeline",
        single: true,
        options: ["ASAP", "1-3 months", "3-6 months", "6+ months"],
        required: true,
      },
      {
        id: "budgetPosture",
        type: "chips",
        label: "Budget posture",
        single: true,
        options: [
          "Budget-conscious",
          "Mid-market",
          "Best-in-class",
          "Flexible / TBD",
        ],
      },
      {
        id: "vendorPreferences",
        type: "text",
        label: "Any vendors to specifically include or exclude?",
        placeholder: "Include TriNet, exclude our current provider...",
        w: "460px",
      },
    ],
  },
  {
    title: "Anything else, and how to reach you",
    intro:
      "The last few things an advisor would ask on a call. Blunt is useful.",
    key: "contactPreference",
    fields: [
      {
        id: "renewalDate",
        type: "text",
        label: "Is a contract renewal or anniversary driving your timing?",
        help: "YYYY-MM-DD if you know it. This decides how much runway a comparison has.",
        placeholder: "2027-01-31",
        w: "220px",
        mono: true,
      },
      {
        id: "decisionMakers",
        type: "text",
        label: "Who else is involved in the decision?",
        placeholder: "Name, title, and anyone else who has to sign off",
        w: "460px",
      },
      {
        id: "notes",
        type: "area",
        label: "Anything else your advisor should know?",
        placeholder:
          "Must-haves, deal-breakers, what went wrong with the last vendor...",
      },
      {
        id: "contactPreference",
        type: "radio",
        label: "How should we get your proposal to you?",
        options: [
          ["call", "Have an advisor call me", ""],
          ["email", "Email me the proposal", ""],
        ],
        required: true,
      },
      {
        id: "bestTime",
        type: "text",
        label: "Best time to reach you",
        placeholder: "Weekday mornings ET",
        w: "300px",
        when: { field: "contactPreference", is: ["call"] },
      },
      {
        id: "referredBy",
        type: "text",
        label: "Referred by an advisor, broker, or partner?",
        placeholder: "Who sent you our way?",
        w: "340px",
      },
    ],
  },
];

export const TOTAL_STEPS = STEPS.length;

/** The category the visitor picked, if it is a known one. */
export function answeredCategory(answers: Answers): Category | undefined {
  const v = answers["category"];
  return isCategory(v) ? v : undefined;
}

/**
 * Whether a field applies, given the category and the answers so far.
 * Used by the UI, by validateStep(), and by the server revalidation, so all
 * three agree on which fields exist for this visitor.
 */
export function isFieldVisible(
  field: FieldDef,
  answers: Answers,
  category = answeredCategory(answers),
): boolean {
  if (field.only && (!category || !field.only.includes(category))) return false;
  if (field.not && category && field.not.includes(category)) return false;
  if (field.when) {
    const v = answers[field.when.field];
    if (typeof v !== "string" || !field.when.is.includes(v)) return false;
  }
  return true;
}

/** The fields of a step that apply to this visitor, in order. */
export function visibleFields(stepIndex: number, answers: Answers): FieldDef[] {
  const category = answeredCategory(answers);
  return STEPS[stepIndex].fields.filter((f) =>
    isFieldVisible(f, answers, category),
  );
}

export function isEmptyValue(v: AnswerValue): boolean {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Returns an error message, or "" when the field is valid. */
export function validateField(field: FieldDef, answers: Answers): string {
  const v = answers[field.id];
  const empty = isEmptyValue(v);
  if (field.required && empty) {
    if (field.type === "cards") return "Pick a category to continue.";
    return field.type === "check" || field.type === "chips"
      ? "Pick at least one. If none apply, choose Other."
      : "This one is needed before the next step.";
  }
  if (empty) return "";
  if (field.id === "category" && !isCategory(v))
    return "Pick a category to continue.";
  if (field.int && !/^\d+$/.test(String(v)))
    return "Whole numbers only: no commas or ranges.";
  if (field.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
    return "Use YYYY-MM-DD, e.g. 2027-01-31.";
  if (field.email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v)))
    return "That address is missing an @ or a domain.";
  return "";
}

/**
 * Validates one step. Only fields visible to this visitor are checked, so a
 * Payroll lead is never rejected for a benefits field it was never shown.
 */
export function validateStep(
  stepIndex: number,
  answers: Answers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(stepIndex, answers)) {
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
      const multi =
        field.type === "check" || (field.type === "chips" && !field.single);
      if (multi) {
        if (Array.isArray(v)) {
          out[field.id] = v
            .filter((x): x is string => typeof x === "string")
            .slice(0, 30)
            .map((x) => x.slice(0, 200));
        }
      } else if (typeof v === "string") {
        out[field.id] = v.slice(0, 2000);
      }
    }
  }
  return out;
}

/** Human-readable value for review, console, and email surfaces. */
export function formatAnswer(fieldId: string, answers: Answers): string {
  const v = answers[fieldId];
  if (Array.isArray(v)) return v.length ? v.join(", ") : "–";
  if (!v) return "–";
  if (fieldId === "category") return categoryName(String(v));
  const field = STEPS.flatMap((s) => s.fields).find((f) => f.id === fieldId);
  if (field?.prefix) return "$" + Number(v).toLocaleString("en-US");
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
  if (isEmptyValue(v)) return "–";
  if (step.summaryFmt) return step.summaryFmt(v);
  return formatAnswer(step.key, answers);
}
