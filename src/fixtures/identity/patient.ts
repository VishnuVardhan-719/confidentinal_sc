import type { PatientDraft } from "@/modules/onboarding/patient";

/**
 * SYNTHETIC questionnaire drafts. Fictional person, placeholder address and a phone number
 * in a format-valid but fictional form. Never real patient data.
 */

export const FIXTURE_PATIENT_DRAFT_NEW: PatientDraft = {
  version: 1,
  updatedAt: "2026-11-17T04:00:00Z",
  sections: {
    account: { contactVerified: true },
    personal: {
      fullName: "Synthetic Patient A",
      birth: { kind: "dob", dateOfBirth: "1990-01-01" },
      addressLine1: "1 Placeholder Street",
      city: "Synthetic City",
      state: "Telangana",
      pinCode: "500001",
      contactPhone: "+916000000000",
    },
    bloodGroup: { state: "unknown" },
    allergies: { state: "none" },
  },
};

export const FIXTURE_PATIENT_DRAFT_COMPLETE: PatientDraft = {
  version: 6,
  updatedAt: "2026-11-17T05:00:00Z",
  sections: {
    account: { contactVerified: true },
    personal: {
      fullName: "Synthetic Patient B",
      birth: { kind: "age", years: 42 },
      addressLine1: "2 Placeholder Street",
      city: "Synthetic City",
      state: "Telangana",
      pinCode: "500002",
      contactPhone: "+916000000000",
      preferredLanguage: "te",
    },
    bloodGroup: { state: "known", value: "O+" },
    allergies: { state: "known", items: [{ substance: "Synthetic allergen" }] },
    medicines: { state: "unknown" },
    surgeries: { state: "none" },
    medicalHistory: { state: "none" },
    family: { state: "none" },
    documents: { state: "none" },
    review: { policyVersion: "fixture-consent-v0", consent: true },
  },
};
