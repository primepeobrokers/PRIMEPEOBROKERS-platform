/*
 * Outcome figures and client references for the home page.
 *
 * Everything here is PLACEHOLDER: invented names, invented companies, invented
 * numbers. The client is supplying real testimonials and case studies. Until
 * they land, PROOF_READY stays false and the section does not render, because
 * publishing fabricated client quotes and savings figures on a licensed
 * brokerage's site is a real liability, not a cosmetic gap.
 *
 * To go live: replace the arrays with approved content and flip PROOF_READY.
 */

export const PROOF_READY = false;

export interface Outcome {
  figure: string;
  label: string;
}

export interface Quote {
  text: string;
  initials: string;
  name: string;
  role: string;
}

export const OUTCOMES: Outcome[] = [
  {
    figure: "$2,940",
    label: "Median annual saving per employee across completed comparisons",
  },
  {
    figure: "11 days",
    label: "Median time from submitted record to a signed provider agreement",
  },
  { figure: "340", label: "Companies placed since 2023" },
];

export const QUOTES: Quote[] = [
  {
    text: "We had three quotes that could not be compared to each other. Prime PEO Brokers put them on one axis and the cheapest one turned out to be the most expensive over a year.",
    initials: "DK",
    name: "Dana Kessler",
    role: "COO, Northgate Logistics",
  },
  {
    text: "The questionnaire asked for ranges, which meant I could finish it without pulling a report. The comparison came back the next morning with the assumptions written out.",
    initials: "MR",
    name: "Marcus Reyes",
    role: "Head of People, Ravenswood Analytics",
  },
  {
    text: "They told us to stay where we were for another year and explained why. That is when I started trusting the rest of it.",
    initials: "AO",
    name: "Alice Okonjo",
    role: "Founder, Coyle Street Provisions",
  },
];
