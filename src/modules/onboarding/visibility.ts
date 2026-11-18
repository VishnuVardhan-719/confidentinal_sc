import type { ProviderCategory } from "@/modules/auth/roles";
import { PROVIDER_SECTION_SCHEMAS } from "./provider";

/**
 * Public preview vs private verification fields (FRONTEND_MASTER s8 doctor review screen;
 * ROLE_ONBOARDING_AND_PERMISSIONS field catalogue). Used to split the review screen.
 * Unlisted paths are PRIVATE by default (fail safe). The server decides the real public
 * projection; this only labels what the applicant is told.
 *
 * - public: shown on the listing once the provider is active
 * - after_verification: shown publicly only after admin review confirms it
 * - private: never public (verification, contact, home location, evidence)
 */
export type FieldVisibility = "public" | "after_verification" | "private";

type Rules = Readonly<Record<string, FieldVisibility>>;

const COMMON: Rules = { listing: "public", documents: "private" };

export const FIELD_VISIBILITY: Readonly<Record<ProviderCategory, Rules>> = {
  doctor: {
    ...COMMON,
    identity: "public",
    "identity.registrationNumber": "after_verification",
    "identity.issuingAuthority": "after_verification",
    "identity.qualifications": "after_verification",
    "practice.homeVisitFeePaise": "public",
    "practice.servicePins": "public",
    "practice.travelRadiusKm": "public",
    "practice.startingPoint": "private",
    availability: "public",
  },
  lab: {
    ...COMMON,
    "organization.brandName": "public",
    "organization.legalName": "private",
    "organization.ownership": "private",
    "organization.managerName": "private",
    "organization.managerPhone": "private",
    branches: "public",
    "credentials.registrationNumber": "private",
    "credentials.accreditation": "after_verification",
    catalog: "public",
    coverage: "public",
    staff: "private",
  },
  ambulance: {
    ...COMMON,
    "operator.operatorName": "public",
    "operator.baseCity": "public",
    "operator.serviceMode": "public",
    "operator.ownership": "private",
    "operator.contactPhone": "private",
    "operator.basePinCode": "private",
    coverage: "public",
    "fleet.vehicles": "after_verification",
    crew: "private",
    availability: "public",
    pricing: "public",
  },
  caretaker: {
    ...COMMON,
    "identity.fullName": "public",
    "identity.agencyName": "public",
    "identity.photoAssetId": "public",
    "identity.languages": "public",
    "identity.experienceYears": "public",
    "identity.ownership": "private",
    qualifications: "after_verification",
    "skills.tasks": "after_verification",
    "skills.nursingCredential": "private",
    coverage: "public",
    availability: "public",
    pricing: "public",
  },
};

/** Longest matching rule wins ("identity.registrationNumber" over "identity"); default private. */
export function fieldVisibility(category: ProviderCategory, path: string): FieldVisibility {
  const rules = FIELD_VISIBILITY[category];
  const parts = path.split(".");
  for (let n = parts.length; n > 0; n -= 1) {
    const key = parts.slice(0, n).join(".");
    if (Object.prototype.hasOwnProperty.call(rules, key)) return rules[key];
  }
  return "private";
}

export type PreviewField = { path: string; value: unknown };
export type PreviewGroups = Record<FieldVisibility, PreviewField[]>;

/** Group saved `section.field` values for the review screen. Unknown sections are ignored. */
export function previewGroups(category: ProviderCategory, sections: Partial<Record<string, unknown>>): PreviewGroups {
  const groups: PreviewGroups = { public: [], after_verification: [], private: [] };
  const known = PROVIDER_SECTION_SCHEMAS[category] as Record<string, unknown>;
  for (const [sectionId, value] of Object.entries(sections)) {
    if (!Object.prototype.hasOwnProperty.call(known, sectionId) || value === null || typeof value !== "object") continue;
    for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      if (fieldValue === undefined) continue;
      const path = `${sectionId}.${field}`;
      groups[fieldVisibility(category, path)].push({ path, value: fieldValue });
    }
  }
  return groups;
}
