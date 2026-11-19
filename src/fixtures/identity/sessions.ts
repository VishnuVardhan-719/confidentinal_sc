import type { Identity, Session } from "@/modules/auth/types";
import { OPERATIONS_ACCOUNTS, OPERATIONS_SCENARIOS, OPERATIONS_SESSIONS } from "./operations";

/**
 * SYNTHETIC identity fixtures. Fictional names, `@example.invalid` emails and placeholder
 * UUIDs only. Never real people, providers or contact details. Development/test use only;
 * the fixture adapter refuses to run when APP_ENV=production.
 */

export const FIXTURE_IDS = {
  patientNew: "00000000-0000-4000-8000-000000000101",
  patientComplete: "00000000-0000-4000-8000-000000000102",
  doctorDraftUser: "00000000-0000-4000-8000-000000000201",
  doctorActiveUser: "00000000-0000-4000-8000-000000000202",
  labOwnerUser: "00000000-0000-4000-8000-000000000301",
  ambulanceUser: "00000000-0000-4000-8000-000000000401",
  caretakerUser: "00000000-0000-4000-8000-000000000501",
  adminUser: "00000000-0000-4000-8000-000000000601",
  multiRoleUser: "00000000-0000-4000-8000-000000000701",
  doctorDraftProvider: "00000000-0000-4000-8000-000000002001",
  doctorActiveProvider: "00000000-0000-4000-8000-000000002002",
  doctorSubmittedProvider: "00000000-0000-4000-8000-000000002003",
  labProvider: "00000000-0000-4000-8000-000000003001",
  ambulanceProvider: "00000000-0000-4000-8000-000000004001",
  caretakerProvider: "00000000-0000-4000-8000-000000005001",
  labOrganization: "00000000-0000-4000-8000-000000030001",
  registrationDocument: "00000000-0000-4000-8000-000000020011",
  licenceDocument: "00000000-0000-4000-8000-000000030011",
  permitDocument: "00000000-0000-4000-8000-000000040011",
  backgroundDocument: "00000000-0000-4000-8000-000000050011",
} as const;

export const FIXTURE_SCENARIOS = [
  "anonymous",
  "patient_new",
  "patient_complete",
  "doctor_draft",
  "doctor_active",
  "lab_pending_review",
  "ambulance_changes_required",
  "caretaker_suspended",
  "admin",
  "multi_role",
  "account_disabled",
  ...OPERATIONS_SCENARIOS,
] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

const identity = (userId: string, displayName: string, workspaces: Identity["workspaces"]): Identity => ({
  userId,
  displayName,
  locale: "en",
  workspaces,
});

export const FIXTURE_SESSIONS: Readonly<Record<FixtureScenario, Session>> = {
  anonymous: { kind: "anonymous" },
  patient_new: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.patientNew, "Synthetic Patient A", [{ role: "patient", state: "onboarding_incomplete" }]),
  },
  patient_complete: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.patientComplete, "Synthetic Patient B", [{ role: "patient", state: "active" }]),
  },
  doctor_draft: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.doctorDraftUser, "Synthetic Doctor C", [
      { role: "patient", state: "onboarding_incomplete" },
      { role: "doctor", state: "onboarding_incomplete", providerId: FIXTURE_IDS.doctorDraftProvider, providerStatus: "draft" },
    ]),
  },
  doctor_active: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.doctorActiveUser, "Synthetic Doctor D", [
      { role: "doctor", state: "active", providerId: FIXTURE_IDS.doctorActiveProvider, providerStatus: "active" },
    ]),
  },
  lab_pending_review: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.labOwnerUser, "Synthetic Lab Owner E", [
      {
        role: "lab",
        state: "pending_review",
        providerId: FIXTURE_IDS.labProvider,
        providerStatus: "under_review",
        membership: {
          organizationId: FIXTURE_IDS.labOrganization,
          organizationName: "Synthetic Diagnostics Org",
          membershipRole: "owner",
          status: "active",
          scopes: ["org:read", "org:edit", "members:read", "provider:read", "provider:manage", "evidence:manage"],
        },
      },
    ]),
  },
  ambulance_changes_required: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.ambulanceUser, "Synthetic Operator F", [
      {
        role: "ambulance",
        state: "onboarding_incomplete",
        providerId: FIXTURE_IDS.ambulanceProvider,
        providerStatus: "changes_required",
      },
    ]),
  },
  caretaker_suspended: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.caretakerUser, "Synthetic Caregiver G", [
      { role: "caretaker", state: "restricted", providerId: FIXTURE_IDS.caretakerProvider, providerStatus: "suspended" },
    ]),
  },
  admin: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.adminUser, "Synthetic Verifier H", [{ role: "admin", state: "active" }]),
  },
  multi_role: {
    kind: "authenticated",
    identity: identity(FIXTURE_IDS.multiRoleUser, "Synthetic Multi-role I", [
      { role: "patient", state: "active" },
      { role: "doctor", state: "active", providerId: FIXTURE_IDS.doctorActiveProvider, providerStatus: "active" },
    ]),
  },
  account_disabled: { kind: "restricted", reason: "account_disabled" },
  ...OPERATIONS_SESSIONS,
};

/** Fixture logins: email -> scenario. Any password of 1..128 chars is accepted in fixture mode. */
export const FIXTURE_ACCOUNTS: Readonly<Record<string, FixtureScenario>> = {
  "patient.new@example.invalid": "patient_new",
  "patient.complete@example.invalid": "patient_complete",
  "doctor.draft@example.invalid": "doctor_draft",
  "doctor.active@example.invalid": "doctor_active",
  "lab.owner@example.invalid": "lab_pending_review",
  "ambulance.operator@example.invalid": "ambulance_changes_required",
  "caregiver.suspended@example.invalid": "caretaker_suspended",
  "verifier@example.invalid": "admin",
  "multi.role@example.invalid": "multi_role",
  "disabled@example.invalid": "account_disabled",
  ...OPERATIONS_ACCOUNTS,
};

/** Fixture-only OTP. Real OTPs are never constants, logged, or placed in URLs. */
export const FIXTURE_OTP_CODE = "246810";
export const FIXTURE_OTP_TTL_SECONDS = 300;
export const FIXTURE_OTP_RESEND_COOLDOWN_SECONDS = 30;
export const FIXTURE_OTP_MAX_RESENDS = 3;
export const FIXTURE_OTP_MAX_ATTEMPTS = 5;
