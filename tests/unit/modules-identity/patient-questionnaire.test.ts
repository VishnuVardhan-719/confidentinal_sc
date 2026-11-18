import { describe, expect, it } from "vitest";
import {
  allergiesSectionSchema,
  birthSchema,
  bloodGroupSectionSchema,
  documentsSectionSchema,
  familySectionSchema,
  medicalHistorySectionSchema,
  medicinesSectionSchema,
  patientCompletion,
  patientQuestionnaireSchema,
  personalSectionSchema,
  questionnaireFromDraft,
  QUESTIONNAIRE_SECTIONS,
  surgeriesSectionSchema,
} from "@/modules/onboarding/patient";
import { FIXTURE_PATIENT_DRAFT_COMPLETE, FIXTURE_PATIENT_DRAFT_NEW } from "@/fixtures/identity";

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("Listed / None / Unknown sections", () => {
  const cases = [
    { name: "allergies", schema: allergiesSectionSchema, item: { substance: "Synthetic allergen" } },
    { name: "medicines", schema: medicinesSectionSchema, item: { name: "Synthetic medicine", dose: "1 tab" } },
    { name: "surgeries", schema: surgeriesSectionSchema, item: { procedure: "Synthetic procedure", year: 2010 } },
    { name: "medicalHistory", schema: medicalHistorySectionSchema, item: { condition: "Synthetic condition" } },
  ] as const;

  for (const { name, schema, item } of cases) {
    it(`${name}: known requires details; none/unknown forbid them`, () => {
      expect(accepts(schema, { state: "known", items: [item] })).toBe(true);
      expect(accepts(schema, { state: "known", items: [] })).toBe(false);
      expect(accepts(schema, { state: "known" })).toBe(false);
      expect(accepts(schema, { state: "none" })).toBe(true);
      expect(accepts(schema, { state: "unknown" })).toBe(true);
      expect(accepts(schema, { state: "none", items: [item] })).toBe(false);
      expect(accepts(schema, { state: "unknown", items: [item] })).toBe(false);
      expect(accepts(schema, { state: "maybe" })).toBe(false);
      expect(accepts(schema, {})).toBe(false);
    });
  }

  it("rejects blank list entries", () => {
    expect(accepts(allergiesSectionSchema, { state: "known", items: [{ substance: "   " }] })).toBe(false);
  });

  it("rejects surgery years in the future", () => {
    const next = new Date().getUTCFullYear() + 1;
    expect(accepts(surgeriesSectionSchema, { state: "known", items: [{ procedure: "X", year: next }] })).toBe(false);
  });
});

describe("blood group", () => {
  it("accepts ABO/Rh or Unknown, never none or a guess", () => {
    expect(accepts(bloodGroupSectionSchema, { state: "known", value: "AB-" })).toBe(true);
    expect(accepts(bloodGroupSectionSchema, { state: "unknown" })).toBe(true);
    expect(accepts(bloodGroupSectionSchema, { state: "none" })).toBe(false);
    expect(accepts(bloodGroupSectionSchema, { state: "known", value: "C+" })).toBe(false);
    expect(accepts(bloodGroupSectionSchema, { state: "known" })).toBe(false);
    expect(accepts(bloodGroupSectionSchema, { state: "unknown", value: "O+" })).toBe(false);
  });
});

describe("family and documents", () => {
  it("family: members or explicit none; no unknown", () => {
    expect(accepts(familySectionSchema, { state: "none" })).toBe(true);
    expect(accepts(familySectionSchema, { state: "unknown" })).toBe(false);
    expect(accepts(familySectionSchema, { state: "known", members: [] })).toBe(false);
    expect(
      accepts(familySectionSchema, { state: "known", members: [{ displayName: "Synthetic Relative", relation: "parent", accessRoute: "adult_invite" }] }),
    ).toBe(true);
    expect(
      accepts(familySectionSchema, { state: "known", members: [{ displayName: "R", relation: "parent", accessRoute: "adult_invite", accessGranted: true }] }),
    ).toBe(false);
  });

  it("documents: metadata only, or 'No documents available'; upload never compulsory", () => {
    expect(accepts(documentsSectionSchema, { state: "none" })).toBe(true);
    const doc = { documentId: "00000000-0000-4000-8000-00000000d001", kind: "lab_report", contentType: "application/pdf", sizeBytes: 1024 };
    expect(accepts(documentsSectionSchema, { state: "known", documents: [doc] })).toBe(true);
    expect(accepts(documentsSectionSchema, { state: "known", documents: [{ ...doc, fileName: "name.pdf" }] })).toBe(false);
    expect(accepts(documentsSectionSchema, { state: "known", documents: [{ ...doc, sizeBytes: 20_000_000 }] })).toBe(false);
    expect(accepts(documentsSectionSchema, { state: "known", documents: [{ ...doc, contentType: "text/html" }] })).toBe(false);
  });

  it("covers exactly the seven questionnaire sections", () => {
    expect([...QUESTIONNAIRE_SECTIONS]).toEqual(["bloodGroup", "allergies", "medicines", "surgeries", "medicalHistory", "family", "documents"]);
    expect(new Set(QUESTIONNAIRE_SECTIONS).size).toBe(7);
  });
});

describe("personal details", () => {
  it("accepts adult DOB or age and rejects minors, future dates and absurd ages", () => {
    expect(accepts(birthSchema, { kind: "dob", dateOfBirth: "1990-01-01" })).toBe(true);
    expect(accepts(birthSchema, { kind: "age", years: 30 })).toBe(true);
    expect(accepts(birthSchema, { kind: "age", years: 12 })).toBe(false);
    expect(accepts(birthSchema, { kind: "age", years: 130 })).toBe(false);
    const tenYearsAgo = `${new Date().getUTCFullYear() - 10}-01-01`;
    expect(accepts(birthSchema, { kind: "dob", dateOfBirth: tenYearsAgo })).toBe(false);
    expect(accepts(birthSchema, { kind: "dob", dateOfBirth: "2999-01-01" })).toBe(false);
    expect(accepts(birthSchema, { kind: "dob", dateOfBirth: "1990-02-30" })).toBe(false);
  });

  it("validates PIN and phone", () => {
    const personal = FIXTURE_PATIENT_DRAFT_NEW.sections.personal;
    expect(accepts(personalSectionSchema, personal)).toBe(true);
    expect(accepts(personalSectionSchema, { ...personal, pinCode: "012345" })).toBe(false);
    expect(accepts(personalSectionSchema, { ...personal, contactPhone: "12345" })).toBe(false);
  });
});

describe("questionnaire completion", () => {
  it("derives completion from required sections, not a percentage", () => {
    const partial = patientCompletion(FIXTURE_PATIENT_DRAFT_NEW.sections);
    expect(partial.readyToSubmit).toBe(false);
    expect(partial.requiredTotal).toBe(11);
    expect(partial.requiredComplete).toBe(4);
    expect(partial.missingRequired).toEqual(["measurements", "medicines", "surgeries", "medicalHistory", "family", "documents", "review"]);
    expect(partial.nextStep).toBe("measurements");
    expect(partial).not.toHaveProperty("percent");
  });

  it("marks invalid saved sections incomplete with field issues", () => {
    const result = patientCompletion({ allergies: { state: "known", items: [] } });
    const allergies = result.steps.find((s) => s.id === "allergies");
    expect(allergies?.state).toBe("incomplete");
    expect(allergies?.issues).toHaveProperty("items");
  });

  it("complete draft builds a valid submission; consent required", () => {
    expect(patientCompletion(FIXTURE_PATIENT_DRAFT_COMPLETE.sections).readyToSubmit).toBe(true);
    const payload = questionnaireFromDraft(FIXTURE_PATIENT_DRAFT_COMPLETE);
    expect(payload).not.toBeNull();
    expect(patientQuestionnaireSchema.safeParse(payload).success).toBe(true);
    const noConsent = { ...FIXTURE_PATIENT_DRAFT_COMPLETE, sections: { ...FIXTURE_PATIENT_DRAFT_COMPLETE.sections, review: undefined } };
    expect(questionnaireFromDraft(noConsent)).toBeNull();
    expect(patientQuestionnaireSchema.safeParse({ ...payload, consent: { policyVersion: "v", consent: false } }).success).toBe(false);
  });
});
