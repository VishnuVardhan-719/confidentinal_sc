import { PROFILE_ITEM_KEYS, type CompletionItem, type PatientAddress, type PatientMember, type PatientOverview, type ProfileItemKey } from "@/modules/patient/schemas";

/** Fictional development records only. Names are labels, not real people. */
export const SYNTHETIC_SELF_PATIENT_ID = "00000000-0000-4000-8002-000000000001";
export const SYNTHETIC_FAMILY_PATIENT_ID = "00000000-0000-4000-8002-000000000002";
export const SYNTHETIC_HOME_ADDRESS_ID = "00000000-0000-4000-8003-000000000001";
export const SYNTHETIC_OTHER_ADDRESS_ID = "00000000-0000-4000-8003-000000000002";
/** Matches the synthetic booking fixture policy; not an approved production policy. */
export const SYNTHETIC_POLICY_ID = "00000000-0000-4000-8000-000000000051";

/** Synthetic stand-in for the server's required list (13 items). The real list is the profile owner's
 * server contract (REQUESTS.md); the UI counts whatever the server marks required. */
export const SYNTHETIC_REQUIRED: readonly ProfileItemKey[] = ["fullName", "email", "mobileVerified", "dateOfBirth", "gender", "address", "city",
  "state", "pin", "pinnedLocation", "allergies", "medicalHistory", "currentMedicines"];
export function syntheticProfile(missing: readonly ProfileItemKey[] = []): CompletionItem[] {
  return PROFILE_ITEM_KEYS.map(key => ({ key, required: SYNTHETIC_REQUIRED.includes(key), done: !missing.includes(key) && SYNTHETIC_REQUIRED.includes(key) }));
}

export function syntheticOverview(missing: readonly ProfileItemKey[] = []): PatientOverview {
  return { questionnaire: missing.some(key => ["allergies", "medicalHistory", "currentMedicines"].includes(key)) ? "incomplete" : "complete",
    completion: syntheticProfile(missing), synthetic: true };
}
export function syntheticMembers(selfMissing: readonly ProfileItemKey[] = []): PatientMember[] {
  return [
    { patientId: SYNTHETIC_SELF_PATIENT_ID, relation: "self", displayName: "Synthetic patient", canBook: true, canViewRecords: true, profile: syntheticProfile(selfMissing), synthetic: true },
    { patientId: SYNTHETIC_FAMILY_PATIENT_ID, relation: "family", displayName: "Synthetic family member", canBook: true, canViewRecords: false,
      profile: syntheticProfile(["dateOfBirth", "allergies", "currentMedicines"]), synthetic: true },
  ];
}
export function syntheticAddresses(): PatientAddress[] {
  return [
    { id: SYNTHETIC_HOME_ADDRESS_ID, label: "home", locality: "Synthetic locality", city: "Synthetic city", pin: "500001", synthetic: true },
    { id: SYNTHETIC_OTHER_ADDRESS_ID, label: "other", locality: "Synthetic second locality", city: "Synthetic city", pin: "500002", synthetic: true },
  ];
}
