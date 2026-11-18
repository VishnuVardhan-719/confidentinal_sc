import { z } from "zod";
import type { ProviderCategory } from "@/modules/auth/roles";
import type { ProviderStatusDisplay } from "@/modules/verification/status";
import {
  contactPhoneSchema,
  evidenceSchema,
  languagesSchema,
  listingSchema,
  optionalText,
  paiseSchema,
  pinCodeSchema,
  pinListSchema,
  shortText,
  weeklyHoursSchema,
  yearSchema,
} from "./shared";
import { computeCompletion, type StepDefinition } from "./steps";

/**
 * Provider onboarding sections per category (FRONTEND_MASTER section 8).
 * Claims (registration, accreditation, vehicle class, nursing scope) are APPLICATIONS for
 * review, never displayed as verified until the server says so.
 * Required evidence kinds match I02 `providers_private.required_kind`.
 * Only `listing` and `documents` are persisted by I02 today; other sections need contracts.
 */

const registrationNumberSchema = z.string().trim().regex(/^[A-Za-z0-9/-]{3,40}$/, { message: "registration_invalid" });

/* ================= Doctor ================= */
export const doctorSectionSchemas = {
  listing: listingSchema,
  identity: z.strictObject({
    registrationNumber: registrationNumberSchema,
    issuingAuthority: shortText(120),
    qualifications: z
      .array(z.strictObject({ degree: shortText(80), institution: optionalText(120), year: yearSchema.optional() }))
      .min(1, { message: "items_required" })
      .max(10),
    specialty: shortText(80),
    experienceYears: z.int().min(0).max(70),
    languages: languagesSchema,
    affiliation: optionalText(160),
    city: shortText(80),
    /** Public profile photo asset. No upload contract yet (REQUESTS.md). */
    photoAssetId: z.uuid({ message: "photo_required" }),
  }),
  practice: z.strictObject({
    homeVisitFeePaise: paiseSchema,
    servicePins: pinListSchema,
    travelRadiusKm: z.int().min(1).max(100),
    /** Private starting point; never public. */
    startingPoint: z.strictObject({ pinCode: pinCodeSchema, locality: shortText(120) }),
  }),
  availability: z.strictObject({ weeklyHours: weeklyHoursSchema }),
  documents: evidenceSchema(["registration"]),
} as const;

export type DoctorStepId = keyof typeof doctorSectionSchemas | "review";
export const DOCTOR_STEPS: readonly StepDefinition<DoctorStepId>[] = [
  { id: "listing", requiredForActivation: true, labelKey: "onboarding.doctor.steps.listing" },
  { id: "identity", requiredForActivation: true, labelKey: "onboarding.doctor.steps.identity" },
  { id: "practice", requiredForActivation: true, labelKey: "onboarding.doctor.steps.practice" },
  { id: "availability", requiredForActivation: true, labelKey: "onboarding.doctor.steps.availability" },
  { id: "documents", requiredForActivation: true, labelKey: "onboarding.doctor.steps.documents" },
  { id: "review", requiredForActivation: true, labelKey: "onboarding.doctor.steps.review" },
];

/* ================= Lab ================= */
export const labSectionSchemas = {
  listing: listingSchema,
  organization: z.strictObject({
    ownership: z.enum(["individual", "organization"]),
    legalName: shortText(160),
    brandName: shortText(160),
    managerName: shortText(120),
    managerPhone: contactPhoneSchema,
  }),
  branches: z.strictObject({
    branches: z
      .array(
        z.strictObject({
          label: shortText(80),
          addressLine1: shortText(160),
          addressLine2: optionalText(160),
          city: shortText(80),
          state: shortText(80),
          pinCode: pinCodeSchema,
          weeklyHours: weeklyHoursSchema,
        }),
      )
      .min(1, { message: "items_required" })
      .max(50),
  }),
  credentials: z.strictObject({
    registrationNumber: registrationNumberSchema,
    /** Accreditation is a claim pending verification; shown only after review. */
    accreditation: z.strictObject({ body: shortText(120), certificateNumber: shortText(60) }).optional(),
  }),
  catalog: z.strictObject({
    tests: z
      .array(
        z.strictObject({
          name: shortText(160),
          code: optionalText(40),
          pricePaise: paiseSchema,
          sampleType: optionalText(60),
          turnaroundHours: z.int().min(1).max(720).optional(),
          homeCollection: z.boolean(),
        }),
      )
      .min(1, { message: "items_required" })
      .max(500),
  }),
  coverage: z.strictObject({ homeCollectionPins: pinListSchema }),
  /** Staff are invited through organization membership; this lists intended roles only. */
  staff: z.strictObject({
    members: z
      .array(z.strictObject({ displayName: shortText(120), function: z.enum(["collector", "reviewer"]) }))
      .max(200),
  }),
  documents: evidenceSchema(["licence"]),
} as const;

export type LabStepId = keyof typeof labSectionSchemas | "review";
/** Order per master: org setup -> branches -> credentials -> catalog/coverage -> staff -> review. */
export const LAB_STEPS: readonly StepDefinition<LabStepId>[] = [
  { id: "listing", requiredForActivation: true, labelKey: "onboarding.lab.steps.listing" },
  { id: "organization", requiredForActivation: true, labelKey: "onboarding.lab.steps.organization" },
  { id: "branches", requiredForActivation: true, labelKey: "onboarding.lab.steps.branches" },
  { id: "credentials", requiredForActivation: true, labelKey: "onboarding.lab.steps.credentials" },
  { id: "documents", requiredForActivation: true, labelKey: "onboarding.lab.steps.documents" },
  { id: "catalog", requiredForActivation: true, labelKey: "onboarding.lab.steps.catalog" },
  { id: "coverage", requiredForActivation: true, labelKey: "onboarding.lab.steps.coverage" },
  { id: "staff", requiredForActivation: false, labelKey: "onboarding.lab.steps.staff" },
  { id: "review", requiredForActivation: true, labelKey: "onboarding.lab.steps.review" },
];

/* ================= Ambulance (scheduled transport only) ================= */
export const AMBULANCE_REQUESTED_CLASSES = ["patient_transport", "bls", "als"] as const;

export const ambulanceSectionSchemas = {
  listing: listingSchema,
  operator: z.strictObject({
    ownership: z.enum(["sole_operator", "company"]),
    operatorName: shortText(160),
    contactPhone: contactPhoneSchema,
    baseCity: shortText(80),
    basePinCode: pinCodeSchema,
    /** Emergency dispatch is disabled; only scheduled transport can be offered. */
    serviceMode: z.literal("scheduled"),
  }),
  coverage: z.strictObject({ coveragePins: pinListSchema }),
  fleet: z.strictObject({
    vehicles: z
      .array(
        z.strictObject({
          registrationNumber: z
            .string()
            .trim()
            .regex(/^[A-Za-z]{2}[ -]?\d{1,2}[ -]?[A-Za-z]{0,3}[ -]?\d{4}$/, { message: "vehicle_registration_invalid" }),
          /** Requested class; verified class is server-assigned after evidence review. */
          requestedClass: z.enum(AMBULANCE_REQUESTED_CLASSES),
          permitDocumentId: z.uuid(),
          equipmentNotes: optionalText(500),
        }),
      )
      .min(1, { message: "items_required" })
      .max(100),
  }),
  crew: z.strictObject({
    drivers: z
      .array(z.strictObject({ displayName: shortText(120), licenceDocumentId: z.uuid(), qualification: optionalText(120) }))
      .min(1, { message: "items_required" })
      .max(200),
  }),
  availability: z.strictObject({ weeklyHours: weeklyHoursSchema }),
  pricing: z.strictObject({
    baseFarePaise: paiseSchema,
    perKmPaise: z.int().nonnegative().max(1_000_000),
    policyNote: optionalText(500),
  }),
  documents: evidenceSchema(["vehicle_permit"]),
} as const;

export type AmbulanceStepId = keyof typeof ambulanceSectionSchemas | "review";
export const AMBULANCE_STEPS: readonly StepDefinition<AmbulanceStepId>[] = [
  { id: "listing", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.listing" },
  { id: "operator", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.operator" },
  { id: "coverage", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.coverage" },
  { id: "fleet", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.fleet" },
  { id: "crew", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.crew" },
  { id: "availability", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.availability" },
  { id: "pricing", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.pricing" },
  { id: "documents", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.documents" },
  { id: "review", requiredForActivation: true, labelKey: "onboarding.ambulance.steps.review" },
];

/* ================= Caretaker ================= */
export const CARE_TASKS_NONCLINICAL = [
  "companionship",
  "mobility_assistance",
  "personal_care",
  "meal_assistance",
  "medication_reminder",
  "household_support",
  "elderly_supervision",
] as const;
/** Clinical nursing actions: only selectable with a nursing credential under review. */
export const CARE_TASKS_CLINICAL = ["wound_dressing", "injection_administration", "catheter_care"] as const;
const CARE_TASKS = [...CARE_TASKS_NONCLINICAL, ...CARE_TASKS_CLINICAL] as const;

export const isClinicalCareTask = (task: string): boolean => (CARE_TASKS_CLINICAL as readonly string[]).includes(task);

export const CARE_PRICING_PERIODS = ["hour", "day", "week", "month"] as const;

export const caretakerSectionSchemas = {
  listing: listingSchema,
  identity: z
    .strictObject({
      ownership: z.enum(["independent", "agency"]),
      fullName: shortText(120),
      agencyName: optionalText(160),
      photoAssetId: z.uuid({ message: "photo_required" }),
      languages: languagesSchema,
      experienceYears: z.int().min(0).max(60),
    })
    .refine((v) => v.ownership !== "agency" || (v.agencyName !== undefined && v.agencyName.length > 0), {
      message: "agency_name_required",
      path: ["agencyName"],
    }),
  qualifications: z.strictObject({
    training: z
      .array(z.strictObject({ title: shortText(120), issuer: optionalText(120), year: yearSchema.optional() }))
      .max(20),
  }),
  skills: z
    .strictObject({
      tasks: z
        .array(z.enum(CARE_TASKS))
        .min(1, { message: "items_required" })
        .refine((t) => new Set(t).size === t.length, { message: "task_duplicate" }),
      nursingCredential: z.strictObject({ registrationNumber: registrationNumberSchema, documentId: z.uuid() }).optional(),
    })
    .refine((v) => !v.tasks.some(isClinicalCareTask) || v.nursingCredential !== undefined, {
      message: "clinical_task_requires_nursing_credential",
      path: ["tasks"],
    }),
  coverage: z.strictObject({ servicePins: pinListSchema, travelRadiusKm: z.int().min(1).max(100) }),
  availability: z.strictObject({ weeklyHours: weeklyHoursSchema }),
  pricing: z.strictObject({
    rates: z
      .array(z.strictObject({ period: z.enum(CARE_PRICING_PERIODS), amountPaise: paiseSchema }))
      .min(1, { message: "items_required" })
      .max(CARE_PRICING_PERIODS.length)
      .refine((r) => new Set(r.map((x) => x.period)).size === r.length, { message: "period_duplicate" }),
  }),
  documents: evidenceSchema(["background_check"]),
} as const;

export type CaretakerStepId = keyof typeof caretakerSectionSchemas | "review";
export const CARETAKER_STEPS: readonly StepDefinition<CaretakerStepId>[] = [
  { id: "listing", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.listing" },
  { id: "identity", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.identity" },
  { id: "qualifications", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.qualifications" },
  { id: "skills", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.skills" },
  { id: "coverage", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.coverage" },
  { id: "availability", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.availability" },
  { id: "pricing", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.pricing" },
  { id: "documents", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.documents" },
  { id: "review", requiredForActivation: true, labelKey: "onboarding.caretaker.steps.review" },
];

/* ================= Category registry ================= */
export const PROVIDER_SECTION_SCHEMAS = {
  doctor: doctorSectionSchemas,
  lab: labSectionSchemas,
  ambulance: ambulanceSectionSchemas,
  caretaker: caretakerSectionSchemas,
} as const;

export const PROVIDER_STEPS = {
  doctor: DOCTOR_STEPS,
  lab: LAB_STEPS,
  ambulance: AMBULANCE_STEPS,
  caretaker: CARETAKER_STEPS,
} as const;

type SchemaMap<C extends ProviderCategory> = (typeof PROVIDER_SECTION_SCHEMAS)[C];
export type ProviderSectionId<C extends ProviderCategory> = keyof SchemaMap<C> & string;
export type ProviderSectionValues<C extends ProviderCategory> = {
  [K in ProviderSectionId<C>]: SchemaMap<C>[K] extends z.ZodType ? z.infer<SchemaMap<C>[K]> : never;
};

/** Server-saved partial provider draft. */
export type ProviderOnboardingDraft<C extends ProviderCategory = ProviderCategory> = C extends ProviderCategory ? {
  category: C;
  providerId: string | null;
  status: ProviderStatusDisplay;
  version: number;
  updatedAt: string | null;
  sections: Partial<ProviderSectionValues<C>>;
} : never;

export function providerCompletion<C extends ProviderCategory>(category: C, sections: Partial<Record<string, unknown>>) {
  const steps = PROVIDER_STEPS[category] as readonly StepDefinition<string>[];
  const schemas = PROVIDER_SECTION_SCHEMAS[category] as Partial<Record<string, z.ZodType>>;
  return computeCompletion(steps, schemas, sections);
}

/** Validate one section value for a category. Unknown section IDs are rejected. */
export function providerSectionSchema(category: ProviderCategory, sectionId: string): z.ZodType | null {
  const schemas = PROVIDER_SECTION_SCHEMAS[category] as Partial<Record<string, z.ZodType>>;
  return Object.prototype.hasOwnProperty.call(schemas, sectionId) ? (schemas[sectionId] ?? null) : null;
}
