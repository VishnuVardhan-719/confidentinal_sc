import type { ProviderCategory } from "@/modules/auth/roles";
import {
  AMBULANCE_REQUESTED_CLASSES,
  CARE_PRICING_PERIODS,
  CARE_TASKS_CLINICAL,
  CARE_TASKS_NONCLINICAL,
} from "@/modules/onboarding/provider";
import { BLOOD_GROUPS, FAMILY_RELATIONS, GENDERS, type PatientStepId } from "@/modules/onboarding/patient";
import { PATIENT_CONSENT_DRAFT_VERSION } from "@/modules/auth/policy";
import type { FieldSpec, SectionSpec } from "./form-spec";

/**
 * Form specs per onboarding section (FRONTEND_MASTER s8). Field names match the module Zod
 * schemas exactly, so server validation paths map straight onto form fields.
 * Label keys are relative to the `onboarding` namespace.
 */

const c = (name: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
  ({ kind: "text", name, labelKey: `fields.common.${name}`, ...extra }) as FieldSpec;

const listing: SectionSpec = {
  kind: "fields",
  fields: [
    { kind: "text", name: "displayName", labelKey: "fields.common.displayName", hintKey: "fields.common.displayNameHint" },
    { kind: "textarea", name: "description", labelKey: "fields.common.description", hintKey: "fields.common.descriptionHint", optional: true },
  ],
};

const availability: SectionSpec = {
  kind: "fields",
  fields: [{ kind: "hours", name: "weeklyHours", labelKey: "fields.common.weeklyHours", hintKey: "fields.common.weeklyHoursHint" }],
};

const languages: FieldSpec = { kind: "langList", name: "languages", labelKey: "fields.common.languages", hintKey: "fields.common.languagesHint" };
const experienceYears: FieldSpec = { kind: "int", name: "experienceYears", labelKey: "fields.common.experienceYears", unitKey: "units.years" };
const yearOpt = (name: string): FieldSpec => ({ kind: "int", name, labelKey: `fields.common.${name}`, optional: true });
const pins = (name: string, hintKey = "fields.common.pinsHint"): FieldSpec => ({ kind: "pinList", name, labelKey: `fields.common.${name}`, hintKey });
const radius: FieldSpec = { kind: "int", name: "travelRadiusKm", labelKey: "fields.common.travelRadiusKm", unitKey: "units.km" };
const photo: FieldSpec = { kind: "unavailableAsset", name: "photoAssetId", labelKey: "fields.common.photo", hintKey: "fields.common.photoUnavailable" };
const documents: SectionSpec = { kind: "readonly" };

export const PATIENT_SPECS: Readonly<Record<PatientStepId, SectionSpec>> = {
  account: { kind: "readonly" },
  personal: {
    kind: "fields",
    fields: [
      { kind: "text", name: "fullName", labelKey: "fields.patient.fullName", autoComplete: "name" },
      { kind: "birth", name: "birth", labelKey: "fields.patient.birth", hintKey: "fields.patient.birthHint", dobOnly: true },
      { kind: "select", name: "gender", labelKey: "fields.patient.gender", options: GENDERS, optionSet: "gender" },
      { kind: "text", name: "email", labelKey: "fields.patient.email", autoComplete: "email", inputMode: "email", optional: true },
      { kind: "text", name: "addressLine1", labelKey: "fields.patient.addressLine1", hintKey: "fields.patient.addressLine1Hint", autoComplete: "address-line1" },
      { kind: "text", name: "addressLine2", labelKey: "fields.common.addressLine2", autoComplete: "address-line2", optional: true },
      { kind: "text", name: "landmark", labelKey: "fields.patient.landmark", optional: true },
      { kind: "text", name: "city", labelKey: "fields.common.city", autoComplete: "address-level2" },
      { kind: "text", name: "state", labelKey: "fields.common.state", autoComplete: "address-level1" },
      { kind: "text", name: "pinCode", labelKey: "fields.common.pinCode", autoComplete: "postal-code", inputMode: "numeric" },
      { kind: "phone", name: "contactPhone", labelKey: "fields.patient.contactPhone" },
      { kind: "location", name: "location", labelKey: "fields.patient.location", hintKey: "fields.patient.locationHint" },
      {
        kind: "group",
        name: "emergencyContact",
        labelKey: "fields.patient.emergencyContact",
        hintKey: "fields.patient.emergencyContactHint",
        optional: true,
        fields: [
          { kind: "text", name: "name", labelKey: "fields.patient.emergencyName" },
          { kind: "text", name: "relation", labelKey: "fields.patient.emergencyRelation" },
          { kind: "phone", name: "phone", labelKey: "fields.common.phone" },
        ],
      },
      { kind: "select", name: "preferredLanguage", labelKey: "fields.patient.preferredLanguage", options: ["en", "te", "hi"], optionSet: "language", optional: true },
    ],
  },
  bloodGroup: {
    kind: "answer",
    states: ["known", "unknown"],
    answerSet: "bloodGroup",
    known: { kind: "select", name: "value", options: BLOOD_GROUPS, optionSet: "bloodGroup" },
  },
  measurements: {
    kind: "fields",
    fields: [
      { kind: "int", name: "heightCm", labelKey: "fields.patient.height", unitKey: "units.cm" },
      { kind: "decimal", name: "weightKg", labelKey: "fields.patient.weight", unitKey: "units.kg" },
    ],
  },
  allergies: {
    kind: "answer",
    states: ["known", "none", "unknown"],
    answerSet: "allergies",
    known: {
      kind: "list",
      name: "items",
      addKey: "actions.addAllergy",
      max: 50,
      fields: [
        { kind: "text", name: "substance", labelKey: "fields.patient.substance" },
        { kind: "text", name: "reaction", labelKey: "fields.patient.reaction", optional: true },
      ],
    },
  },
  medicines: {
    kind: "answer",
    states: ["known", "none", "unknown"],
    answerSet: "medicines",
    known: {
      kind: "list",
      name: "items",
      addKey: "actions.addMedicine",
      max: 50,
      fields: [
        { kind: "text", name: "name", labelKey: "fields.patient.medicineName" },
        { kind: "text", name: "dose", labelKey: "fields.patient.dose", optional: true },
        { kind: "text", name: "frequency", labelKey: "fields.patient.frequency", optional: true },
      ],
    },
  },
  surgeries: {
    kind: "answer",
    states: ["known", "none", "unknown"],
    answerSet: "surgeries",
    known: {
      kind: "list",
      name: "items",
      addKey: "actions.addSurgery",
      max: 30,
      fields: [
        { kind: "text", name: "procedure", labelKey: "fields.patient.procedure" },
        yearOpt("year"),
        { kind: "textarea", name: "note", labelKey: "fields.common.note", optional: true },
      ],
    },
  },
  medicalHistory: {
    kind: "answer",
    states: ["known", "none", "unknown"],
    answerSet: "medicalHistory",
    known: {
      kind: "list",
      name: "items",
      addKey: "actions.addCondition",
      max: 50,
      fields: [
        { kind: "text", name: "condition", labelKey: "fields.patient.condition" },
        yearOpt("sinceYear"),
        { kind: "textarea", name: "note", labelKey: "fields.common.note", optional: true },
      ],
    },
  },
  family: {
    kind: "answer",
    states: ["known", "none"],
    answerSet: "family",
    known: {
      kind: "list",
      name: "members",
      addKey: "actions.addFamilyMember",
      max: 10,
      fields: [
        { kind: "text", name: "displayName", labelKey: "fields.patient.memberName" },
        { kind: "select", name: "relation", labelKey: "fields.patient.relation", options: FAMILY_RELATIONS, optionSet: "relation" },
        { kind: "select", name: "accessRoute", labelKey: "fields.patient.accessRoute", hintKey: "fields.patient.accessRouteHint", options: ["adult_invite", "guardian"], optionSet: "accessRoute" },
      ],
    },
  },
  documents: { kind: "answer", states: ["known", "none"], answerSet: "documents", known: { kind: "unavailable" } },
  review: {
    kind: "fields",
    fields: [
      { kind: "const", name: "policyVersion", labelKey: "fields.patient.policyVersion", value: PATIENT_CONSENT_DRAFT_VERSION },
      { kind: "consent", name: "consent", labelKey: "fields.patient.consent", hintKey: "fields.patient.consentHint" },
    ],
  },
};

const hoursField: FieldSpec = { kind: "hours", name: "weeklyHours", labelKey: "fields.common.weeklyHours" };

export const PROVIDER_SPECS: Readonly<Record<ProviderCategory, Readonly<Record<string, SectionSpec>>>> = {
  doctor: {
    listing,
    identity: {
      kind: "fields",
      fields: [
        { kind: "text", name: "registrationNumber", labelKey: "fields.doctor.registrationNumber", hintKey: "fields.doctor.registrationNumberHint" },
        { kind: "text", name: "issuingAuthority", labelKey: "fields.doctor.issuingAuthority", hintKey: "fields.doctor.issuingAuthorityHint" },
        {
          kind: "list",
          name: "qualifications",
          labelKey: "fields.doctor.qualifications",
          addKey: "actions.addQualification",
          max: 10,
          fields: [
            { kind: "text", name: "degree", labelKey: "fields.doctor.degree" },
            { kind: "text", name: "institution", labelKey: "fields.doctor.institution", optional: true },
            yearOpt("year"),
          ],
        },
        { kind: "text", name: "specialty", labelKey: "fields.doctor.specialty" },
        experienceYears,
        languages,
        { kind: "text", name: "affiliation", labelKey: "fields.doctor.affiliation", optional: true },
        c("city"),
        photo,
      ],
    },
    practice: {
      kind: "fields",
      fields: [
        { kind: "rupees", name: "homeVisitFeePaise", labelKey: "fields.doctor.homeVisitFee", hintKey: "fields.common.rupeesHint" },
        pins("servicePins"),
        radius,
        {
          kind: "group",
          name: "startingPoint",
          labelKey: "fields.doctor.startingPoint",
          hintKey: "fields.doctor.startingPointHint",
          fields: [
            { kind: "text", name: "pinCode", labelKey: "fields.common.pinCode", inputMode: "numeric" },
            { kind: "text", name: "locality", labelKey: "fields.common.locality" },
          ],
        },
      ],
    },
    availability,
    documents,
  },
  lab: {
    listing,
    organization: {
      kind: "fields",
      fields: [
        { kind: "select", name: "ownership", labelKey: "fields.lab.ownership", options: ["individual", "organization"], optionSet: "labOwnership" },
        { kind: "text", name: "legalName", labelKey: "fields.lab.legalName", hintKey: "fields.common.privateHint" },
        { kind: "text", name: "brandName", labelKey: "fields.lab.brandName" },
        { kind: "text", name: "managerName", labelKey: "fields.lab.managerName" },
        { kind: "phone", name: "managerPhone", labelKey: "fields.lab.managerPhone", hintKey: "fields.common.privateHint" },
      ],
    },
    branches: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "branches",
          labelKey: "fields.lab.branches",
          addKey: "actions.addBranch",
          max: 50,
          fields: [
            { kind: "text", name: "label", labelKey: "fields.lab.branchLabel" },
            c("addressLine1"),
            c("addressLine2", { optional: true }),
            c("city"),
            c("state"),
            c("pinCode", { inputMode: "numeric" }),
            hoursField,
          ],
        },
      ],
    },
    credentials: {
      kind: "fields",
      fields: [
        { kind: "text", name: "registrationNumber", labelKey: "fields.lab.registrationNumber", hintKey: "fields.common.privateHint" },
        {
          kind: "group",
          name: "accreditation",
          labelKey: "fields.lab.accreditation",
          hintKey: "fields.lab.accreditationHint",
          optional: true,
          fields: [
            { kind: "text", name: "body", labelKey: "fields.lab.accreditationBody" },
            { kind: "text", name: "certificateNumber", labelKey: "fields.lab.certificateNumber" },
          ],
        },
      ],
    },
    catalog: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "tests",
          labelKey: "fields.lab.tests",
          addKey: "actions.addTest",
          max: 500,
          fields: [
            { kind: "text", name: "name", labelKey: "fields.lab.testName" },
            { kind: "text", name: "code", labelKey: "fields.lab.testCode", optional: true },
            { kind: "rupees", name: "pricePaise", labelKey: "fields.lab.price", hintKey: "fields.common.rupeesHint" },
            { kind: "text", name: "sampleType", labelKey: "fields.lab.sampleType", optional: true },
            { kind: "int", name: "turnaroundHours", labelKey: "fields.lab.turnaroundHours", unitKey: "units.hours", optional: true },
            { kind: "boolean", name: "homeCollection", labelKey: "fields.lab.homeCollection" },
          ],
        },
      ],
    },
    coverage: { kind: "fields", fields: [pins("homeCollectionPins")] },
    staff: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "members",
          labelKey: "fields.lab.staff",
          hintKey: "fields.lab.staffHint",
          addKey: "actions.addStaff",
          max: 200,
          optional: true,
          fields: [
            { kind: "text", name: "displayName", labelKey: "fields.lab.staffName" },
            { kind: "select", name: "function", labelKey: "fields.lab.staffFunction", options: ["collector", "reviewer"], optionSet: "staffFunction" },
          ],
        },
      ],
    },
    documents,
  },
  ambulance: {
    listing,
    operator: {
      kind: "fields",
      fields: [
        { kind: "select", name: "ownership", labelKey: "fields.ambulance.ownership", options: ["sole_operator", "company"], optionSet: "ambulanceOwnership" },
        { kind: "text", name: "operatorName", labelKey: "fields.ambulance.operatorName" },
        { kind: "phone", name: "contactPhone", labelKey: "fields.ambulance.contactPhone", hintKey: "fields.common.privateHint" },
        { kind: "text", name: "baseCity", labelKey: "fields.ambulance.baseCity" },
        { kind: "text", name: "basePinCode", labelKey: "fields.ambulance.basePinCode", inputMode: "numeric", hintKey: "fields.common.privateHint" },
        { kind: "const", name: "serviceMode", labelKey: "fields.ambulance.serviceMode", hintKey: "fields.ambulance.serviceModeHint", value: "scheduled" },
      ],
    },
    coverage: { kind: "fields", fields: [pins("coveragePins")] },
    fleet: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "vehicles",
          labelKey: "fields.ambulance.vehicles",
          addKey: "actions.addVehicle",
          max: 100,
          fields: [
            { kind: "text", name: "registrationNumber", labelKey: "fields.ambulance.vehicleRegistration", hintKey: "fields.ambulance.vehicleRegistrationHint" },
            { kind: "select", name: "requestedClass", labelKey: "fields.ambulance.requestedClass", hintKey: "fields.ambulance.requestedClassHint", options: AMBULANCE_REQUESTED_CLASSES, optionSet: "vehicleClass" },
            { kind: "documentRef", name: "permitDocumentId", labelKey: "fields.ambulance.permitDocument", hintKey: "fields.common.documentRefHint", documentKind: "vehicle_permit" },
            { kind: "textarea", name: "equipmentNotes", labelKey: "fields.ambulance.equipmentNotes", optional: true },
          ],
        },
      ],
    },
    crew: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "drivers",
          labelKey: "fields.ambulance.drivers",
          addKey: "actions.addDriver",
          max: 200,
          fields: [
            { kind: "text", name: "displayName", labelKey: "fields.ambulance.driverName" },
            { kind: "documentRef", name: "licenceDocumentId", labelKey: "fields.ambulance.licenceDocument", hintKey: "fields.common.documentRefHint", documentKind: "licence" },
            { kind: "text", name: "qualification", labelKey: "fields.ambulance.qualification", optional: true },
          ],
        },
      ],
    },
    availability,
    pricing: {
      kind: "fields",
      fields: [
        { kind: "rupees", name: "baseFarePaise", labelKey: "fields.ambulance.baseFare", hintKey: "fields.common.rupeesHint" },
        { kind: "rupees", name: "perKmPaise", labelKey: "fields.ambulance.perKm", hintKey: "fields.common.rupeesHint" },
        { kind: "textarea", name: "policyNote", labelKey: "fields.ambulance.policyNote", optional: true },
      ],
    },
    documents,
  },
  caretaker: {
    listing,
    identity: {
      kind: "fields",
      fields: [
        { kind: "select", name: "ownership", labelKey: "fields.caretaker.ownership", options: ["independent", "agency"], optionSet: "careOwnership" },
        { kind: "text", name: "fullName", labelKey: "fields.caretaker.fullName" },
        { kind: "text", name: "agencyName", labelKey: "fields.caretaker.agencyName", hintKey: "fields.caretaker.agencyNameHint", optional: true },
        photo,
        languages,
        experienceYears,
      ],
    },
    qualifications: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "training",
          labelKey: "fields.caretaker.training",
          hintKey: "fields.caretaker.trainingHint",
          addKey: "actions.addTraining",
          max: 20,
          optional: true,
          fields: [
            { kind: "text", name: "title", labelKey: "fields.caretaker.trainingTitle" },
            { kind: "text", name: "issuer", labelKey: "fields.caretaker.issuer", optional: true },
            yearOpt("year"),
          ],
        },
      ],
    },
    skills: {
      kind: "fields",
      fields: [
        { kind: "multi", name: "tasks", labelKey: "fields.caretaker.tasks", hintKey: "fields.caretaker.tasksHint", options: [...CARE_TASKS_NONCLINICAL, ...CARE_TASKS_CLINICAL], optionSet: "careTask" },
        {
          kind: "group",
          name: "nursingCredential",
          labelKey: "fields.caretaker.nursingCredential",
          hintKey: "fields.caretaker.nursingCredentialHint",
          optional: true,
          fields: [
            { kind: "text", name: "registrationNumber", labelKey: "fields.caretaker.nursingRegistration" },
            { kind: "documentRef", name: "documentId", labelKey: "fields.caretaker.nursingDocument", hintKey: "fields.common.documentRefHint", documentKind: "registration" },
          ],
        },
      ],
    },
    coverage: { kind: "fields", fields: [pins("servicePins"), radius] },
    availability,
    pricing: {
      kind: "fields",
      fields: [
        {
          kind: "list",
          name: "rates",
          labelKey: "fields.caretaker.rates",
          hintKey: "fields.caretaker.ratesHint",
          addKey: "actions.addRate",
          max: CARE_PRICING_PERIODS.length,
          fields: [
            { kind: "select", name: "period", labelKey: "fields.caretaker.period", options: CARE_PRICING_PERIODS, optionSet: "period" },
            { kind: "rupees", name: "amountPaise", labelKey: "fields.caretaker.amount", hintKey: "fields.common.rupeesHint" },
          ],
        },
      ],
    },
    documents,
  },
};

export function providerSpec(category: ProviderCategory, sectionId: string): SectionSpec | null {
  const specs = PROVIDER_SPECS[category];
  return Object.prototype.hasOwnProperty.call(specs, sectionId) ? specs[sectionId] : null;
}
