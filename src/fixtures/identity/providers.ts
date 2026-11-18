import type { ProviderOnboardingDraft } from "@/modules/onboarding/provider";
import type { ProviderReviewDetail } from "@/modules/verification/schemas";
import { FIXTURE_IDS } from "./sessions";

/** SYNTHETIC provider records for fixture adapters. Not real providers; never shown as live. */

export const FIXTURE_REVIEW_DETAILS: readonly ProviderReviewDetail[] = [
  {
    providerId: FIXTURE_IDS.doctorSubmittedProvider,
    category: "doctor",
    status: "submitted",
    version: 4,
    displayName: "Synthetic Doctor J",
    description: "Synthetic profile for review screens.",
    documents: [
      {
        id: FIXTURE_IDS.registrationDocument,
        kind: "registration",
        status: "pending",
        expiresAt: "2029-12-31T00:00:00Z",
        createdAt: "2026-11-15T05:00:00Z",
      },
    ],
    events: [
      {
        fromState: "draft",
        toState: "submitted",
        publicReason: "Application submitted.",
        providerVersion: 4,
        occurredAt: "2026-11-15T05:10:00Z",
      },
    ],
  },
  {
    providerId: FIXTURE_IDS.labProvider,
    category: "lab",
    status: "under_review",
    version: 7,
    displayName: "Synthetic Diagnostics",
    description: "Synthetic lab profile for review screens.",
    documents: [
      {
        id: FIXTURE_IDS.licenceDocument,
        kind: "licence",
        status: "pending",
        expiresAt: "2028-06-30T00:00:00Z",
        createdAt: "2026-11-14T08:00:00Z",
      },
    ],
    events: [
      { fromState: "draft", toState: "submitted", publicReason: "Application submitted.", providerVersion: 6, occurredAt: "2026-11-14T08:30:00Z" },
      { fromState: "submitted", toState: "under_review", publicReason: "Application under review.", providerVersion: 7, occurredAt: "2026-11-16T04:00:00Z" },
    ],
  },
  {
    providerId: FIXTURE_IDS.caretakerProvider,
    category: "caretaker",
    status: "suspended",
    version: 9,
    displayName: "Synthetic Caregiver G",
    description: "Synthetic caregiver profile.",
    documents: [
      {
        id: FIXTURE_IDS.backgroundDocument,
        kind: "background_check",
        status: "verified",
        expiresAt: "2027-03-31T00:00:00Z",
        createdAt: "2026-10-01T08:00:00Z",
      },
    ],
    events: [
      {
        fromState: "approved",
        toState: "suspended",
        publicReason: "Provider suspended. Contact support for next steps.",
        providerVersion: 9,
        occurredAt: "2026-11-10T09:00:00Z",
      },
    ],
  },
];

export const FIXTURE_PROVIDER_DRAFTS: readonly ProviderOnboardingDraft[] = [
  {
    category: "doctor",
    providerId: FIXTURE_IDS.doctorDraftProvider,
    status: "draft",
    version: 2,
    updatedAt: "2026-11-17T06:00:00Z",
    sections: {
      listing: { displayName: "Synthetic Doctor C", description: "Synthetic general physician profile." },
    },
  },
  {
    category: "ambulance",
    providerId: FIXTURE_IDS.ambulanceProvider,
    status: "changes_required",
    version: 5,
    updatedAt: "2026-11-16T10:00:00Z",
    sections: {
      listing: { displayName: "Synthetic Transport Co", description: "" },
      operator: {
        ownership: "company",
        operatorName: "Synthetic Transport Co",
        contactPhone: "+916000000000",
        baseCity: "Synthetic City",
        basePinCode: "500001",
        serviceMode: "scheduled",
      },
      coverage: { coveragePins: ["500001", "500002"] },
    },
  },
];
