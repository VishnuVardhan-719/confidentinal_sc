export type Category = {
  slug: "doctor" | "lab" | "scheduled-ambulance" | "caretaker";
  name: string;
  summary: string;
  /** One line on what the service is not, shown on index pages. Restates the notes below; no new claims. */
  boundary: string;
  intro: string;
  helps: string[];
  notes: string[];
};

export const categories: readonly Category[] = [
  {
    slug: "doctor",
    name: "Doctor visits",
    summary: "Arrange a consultation with a doctor you choose.",
    boundary: "For planned, non-urgent concerns. Not for emergencies.",
    intro:
      "Doctor visits are meant for planned consultations. You will choose the doctor, and the doctor decides whether to accept your request.",
    helps: [
      "Planned consultations for non-urgent concerns",
      "Follow-up visits with a doctor you already know",
      "Understanding the steps before you request a visit",
    ],
    notes: [
      "Doctors set their own fees and accept requests themselves.",
      "This page gives general information and is not medical advice.",
    ],
  },
  {
    slug: "lab",
    name: "Lab services",
    summary: "Request diagnostic tests from a lab you choose.",
    boundary: "Results are for you and your doctor to interpret.",
    intro:
      "Lab services are meant for tests that have been advised or that you want to arrange in advance. Each lab decides which requests it accepts.",
    helps: [
      "Planned diagnostic tests",
      "Choosing a lab before you book",
      "Keeping the request and its status in one place",
    ],
    notes: [
      "Labs set their own prices and accept requests themselves.",
      "Test results are for you and your doctor to interpret.",
    ],
  },
  {
    slug: "scheduled-ambulance",
    name: "Scheduled ambulance",
    summary: "Plan non-emergency patient transport ahead of time.",
    boundary: "Planned journeys only. Not an emergency service.",
    intro:
      "Scheduled ambulance is for planned journeys, such as a hospital appointment or a transfer arranged in advance.",
    helps: [
      "Planned, non-emergency patient transport",
      "Journeys arranged ahead of time",
      "Requests that the provider confirms before the day",
    ],
    notes: [
      "This is not an emergency service. In an emergency in India, call 112.",
      "The provider decides whether it can take a request.",
    ],
  },
  {
    slug: "caretaker",
    name: "Caretaker support",
    summary: "Request non-clinical help with day-to-day care.",
    boundary: "Non-clinical help. Caretakers do not provide medical treatment.",
    intro:
      "Caretaker support covers non-clinical help, such as companionship and assistance with daily routines. It does not replace medical care.",
    helps: [
      "Non-clinical help at home",
      "Support with daily routines",
      "Arranging help in advance with a provider you choose",
    ],
    notes: [
      "Caretakers do not provide medical treatment.",
      "Caretakers set their own terms and accept requests themselves.",
    ],
  },
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
