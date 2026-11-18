import { z } from "zod";
import { localeSchema } from "@/modules/auth/roles";
import { documentContentTypeSchema, MAX_DOCUMENT_BYTES } from "@/modules/verification/schemas";
import { contactPhoneSchema, optionalText, pinCodeSchema, shortText, yearSchema } from "./shared";
import { computeCompletion, type StepDefinition } from "./steps";

/**
 * Patient health questionnaire (FRONTEND_MASTER section 8, ROLE_ONBOARDING_AND_PERMISSIONS).
 * Answer states follow the canonical draft `answer_state`: known (Listed) / none / unknown.
 * Details are required ONLY when `known`; `none`/`unknown` must not carry details.
 * Everything here is patient-reported; the server records provenance. Never present as
 * clinician-verified. Health questions/minor flows still need clinical/governance approval.
 */

const ANSWER_STATES = ["known", "none", "unknown"] as const;
export type AnswerState = (typeof ANSWER_STATES)[number];

/** Listed / None / Unknown section with a repeatable list when known. */
function listedSection<T extends z.ZodType>(item: T, max: number) {
  return z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("known"), items: z.array(item).min(1, { message: "items_required" }).max(max) }),
    z.strictObject({ state: z.literal("none") }),
    z.strictObject({ state: z.literal("unknown") }),
  ]);
}

/* ---------- Account (server-derived) ---------- */
export const accountSectionSchema = z.strictObject({ contactVerified: z.literal(true, { message: "contact_unverified" }) });

/* ---------- Personal ---------- */
export const MINIMUM_SELF_ONBOARDING_AGE = 18;

const isoDateSchema = z.iso.date({ message: "date_invalid" });

function ageOn(dateOfBirth: string, now: Date): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** DOB or age. Minors are rejected until an approved guardian/minor flow exists. */
export const birthSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({ kind: z.literal("dob"), dateOfBirth: isoDateSchema })
    .refine((v) => Date.parse(v.dateOfBirth) <= Date.now(), { message: "date_in_future", path: ["dateOfBirth"] })
    .refine((v) => ageOn(v.dateOfBirth, new Date()) <= 120, { message: "age_out_of_range", path: ["dateOfBirth"] })
    .refine((v) => ageOn(v.dateOfBirth, new Date()) >= MINIMUM_SELF_ONBOARDING_AGE, {
      message: "minor_flow_not_approved",
      path: ["dateOfBirth"],
    }),
  z.strictObject({
    kind: z.literal("age"),
    years: z
      .int({ message: "age_out_of_range" })
      .max(120, { message: "age_out_of_range" })
      .min(MINIMUM_SELF_ONBOARDING_AGE, { message: "minor_flow_not_approved" }),
  }),
]);

export const personalSectionSchema = z.strictObject({
  fullName: shortText(120),
  birth: birthSchema,
  addressLine1: shortText(160),
  addressLine2: optionalText(160),
  city: shortText(80),
  state: shortText(80),
  pinCode: pinCodeSchema,
  contactPhone: contactPhoneSchema,
  emergencyContact: z
    .strictObject({ name: shortText(120), relation: shortText(40), phone: contactPhoneSchema })
    .optional(),
  preferredLanguage: localeSchema.optional(),
});

/* ---------- Blood group: known ABO/Rh or Unknown. No `none`. ---------- */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const bloodGroupSectionSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("known"), value: z.enum(BLOOD_GROUPS) }),
  z.strictObject({ state: z.literal("unknown") }),
]);

/* ---------- Listed / None / Unknown sections ---------- */
export const allergiesSectionSchema = listedSection(
  z.strictObject({ substance: shortText(120), reaction: optionalText(200) }),
  50,
);

export const medicinesSectionSchema = listedSection(
  z.strictObject({ name: shortText(120), dose: optionalText(60), frequency: optionalText(60) }),
  50,
);

export const surgeriesSectionSchema = listedSection(
  z.strictObject({ procedure: shortText(160), year: yearSchema.optional(), note: optionalText(300) }),
  30,
);

export const medicalHistorySectionSchema = listedSection(
  z.strictObject({ condition: shortText(160), sinceYear: yearSchema.optional(), note: optionalText(300) }),
  50,
);

/* ---------- Family: members or "No family members added". No `unknown`. ---------- */
export const FAMILY_RELATIONS = ["spouse", "parent", "child", "sibling", "grandparent", "grandchild", "other"] as const;
/**
 * Listing a member grants NOTHING. Adult invite / guardian verification is server-side and
 * disabled until canonical-schema Q01 safeguards pass.
 */
export const familySectionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("known"),
    members: z
      .array(
        z.strictObject({
          displayName: shortText(80),
          relation: z.enum(FAMILY_RELATIONS),
          accessRoute: z.enum(["adult_invite", "guardian"]),
        }),
      )
      .min(1, { message: "items_required" })
      .max(10),
  }),
  z.strictObject({ state: z.literal("none") }),
]);

/* ---------- Documents: metadata of private uploads, or "No documents available". ---------- */
export const PATIENT_DOCUMENT_KINDS = ["prescription", "lab_report", "discharge_summary", "imaging", "other"] as const;
export const patientDocumentMetadataSchema = z.strictObject({
  /** Server-issued metadata ID; never a storage path or filename. */
  documentId: z.uuid(),
  kind: z.enum(PATIENT_DOCUMENT_KINDS),
  contentType: documentContentTypeSchema,
  sizeBytes: z.int().positive().max(MAX_DOCUMENT_BYTES, { message: "file_too_large" }),
});
export const documentsSectionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("known"),
    documents: z.array(patientDocumentMetadataSchema).min(1, { message: "items_required" }).max(20),
  }),
  z.strictObject({ state: z.literal("none") }),
]);

/* ---------- Review / consent (aligned with I01 selfPatientSchema). ---------- */
export const consentSectionSchema = z.strictObject({
  policyVersion: z.string().trim().min(1).max(80),
  consent: z.literal(true, { message: "consent_required" }),
});

export const patientSectionSchemas = {
  account: accountSectionSchema,
  personal: personalSectionSchema,
  bloodGroup: bloodGroupSectionSchema,
  allergies: allergiesSectionSchema,
  medicines: medicinesSectionSchema,
  surgeries: surgeriesSectionSchema,
  medicalHistory: medicalHistorySectionSchema,
  family: familySectionSchema,
  documents: documentsSectionSchema,
  review: consentSectionSchema,
} as const;

export type PatientStepId = keyof typeof patientSectionSchemas;
export type PatientSections = { [K in PatientStepId]: z.infer<(typeof patientSectionSchemas)[K]> };

/** The seven truthful-questionnaire sections that accept Listed/None/Unknown-style answers. */
export const QUESTIONNAIRE_SECTIONS = [
  "bloodGroup",
  "allergies",
  "medicines",
  "surgeries",
  "medicalHistory",
  "family",
  "documents",
] as const satisfies readonly PatientStepId[];

export const PATIENT_STEPS: readonly StepDefinition<PatientStepId>[] = [
  { id: "account", requiredForActivation: true, labelKey: "onboarding.patient.steps.account" },
  { id: "personal", requiredForActivation: true, labelKey: "onboarding.patient.steps.personal" },
  { id: "bloodGroup", requiredForActivation: true, labelKey: "onboarding.patient.steps.bloodGroup" },
  { id: "allergies", requiredForActivation: true, labelKey: "onboarding.patient.steps.allergies" },
  { id: "medicines", requiredForActivation: true, labelKey: "onboarding.patient.steps.medicines" },
  { id: "surgeries", requiredForActivation: true, labelKey: "onboarding.patient.steps.surgeries" },
  { id: "medicalHistory", requiredForActivation: true, labelKey: "onboarding.patient.steps.medicalHistory" },
  { id: "family", requiredForActivation: true, labelKey: "onboarding.patient.steps.family" },
  { id: "documents", requiredForActivation: true, labelKey: "onboarding.patient.steps.documents" },
  { id: "review", requiredForActivation: true, labelKey: "onboarding.patient.steps.review" },
];

/** Full submission (POST /api/onboarding/patient). Account is server-known and not sent. */
export const patientQuestionnaireSchema = z.strictObject({
  personal: personalSectionSchema,
  bloodGroup: bloodGroupSectionSchema,
  allergies: allergiesSectionSchema,
  medicines: medicinesSectionSchema,
  surgeries: surgeriesSectionSchema,
  medicalHistory: medicalHistorySectionSchema,
  family: familySectionSchema,
  documents: documentsSectionSchema,
  consent: consentSectionSchema,
});
export type PatientQuestionnaire = z.infer<typeof patientQuestionnaireSchema>;

/** Server-saved partial draft. Each saved section was valid when saved; re-validated on read. */
export const patientDraftSchema = z.strictObject({
  version: z.int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  sections: z.strictObject({
    account: accountSectionSchema.optional(),
    personal: personalSectionSchema.optional(),
    bloodGroup: bloodGroupSectionSchema.optional(),
    allergies: allergiesSectionSchema.optional(),
    medicines: medicinesSectionSchema.optional(),
    surgeries: surgeriesSectionSchema.optional(),
    medicalHistory: medicalHistorySectionSchema.optional(),
    family: familySectionSchema.optional(),
    documents: documentsSectionSchema.optional(),
    review: consentSectionSchema.optional(),
  }),
});
export type PatientDraft = z.infer<typeof patientDraftSchema>;

export const patientCompletion = (sections: Partial<Record<PatientStepId, unknown>>) =>
  computeCompletion(PATIENT_STEPS, patientSectionSchemas, sections);

/** Build the submission payload from a complete draft, or null if anything required is missing/invalid. */
export function questionnaireFromDraft(draft: PatientDraft): PatientQuestionnaire | null {
  const s = draft.sections;
  const parsed = patientQuestionnaireSchema.safeParse({
    personal: s.personal,
    bloodGroup: s.bloodGroup,
    allergies: s.allergies,
    medicines: s.medicines,
    surgeries: s.surgeries,
    medicalHistory: s.medicalHistory,
    family: s.family,
    documents: s.documents,
    consent: s.review,
  });
  return parsed.success && s.account?.contactVerified === true ? parsed.data : null;
}

export { ANSWER_STATES };
