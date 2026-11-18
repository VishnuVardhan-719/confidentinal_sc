import type { z } from "zod";
import {
  assessmentStepSchema,
  careStepSchema,
  evaluateVitalWarnings,
  missingForFinalize,
  prescriptionStepSchema,
  unacknowledgedWarnings,
  vitalsStepSchema,
  type AssessmentStep,
  type CareStep,
  type ClinicalDraftContent,
  type FollowUp,
  type MedicineLine,
  type MissingField,
  type Prescription,
  type PrescriptionStep,
  type TestOrReferral,
  type VitalsStep,
  type VitalWarning,
  type VitalWarningRule,
} from "./schemas";

/**
 * Consultation editor step logic and view models (pure, framework-free).
 * The UI renders these; it never decides clinical completeness on its own.
 */
export const CLINICAL_STEPS = ["vitals", "assessment", "prescription", "care", "review"] as const;
export type ClinicalStepId = (typeof CLINICAL_STEPS)[number];
export type EditableStepId = Exclude<ClinicalStepId, "review">;

export const STEP_LABEL_KEYS: Readonly<Record<ClinicalStepId, string>> = {
  vitals: "clinical.editor.step.vitals",
  assessment: "clinical.editor.step.assessment",
  prescription: "clinical.editor.step.prescription",
  care: "clinical.editor.step.care",
  review: "clinical.editor.step.review",
};

export const isStepId = (v: unknown): v is ClinicalStepId => typeof v === "string" && (CLINICAL_STEPS as readonly string[]).includes(v);
export const stepIndex = (s: ClinicalStepId) => CLINICAL_STEPS.indexOf(s);
export const nextStep = (s: ClinicalStepId): ClinicalStepId | null => CLINICAL_STEPS[stepIndex(s) + 1] ?? null;
export const prevStep = (s: ClinicalStepId): ClinicalStepId | null => (stepIndex(s) > 0 ? CLINICAL_STEPS[stepIndex(s) - 1] : null);

// ---- Missing-field metadata (error summary + focus first invalid) -------------------------
export type MissingFieldMeta = { field: MissingField; step: EditableStepId; labelKey: string; /** DOM id of the control to focus. */ focusId: string };

export const MISSING_FIELD_META: Readonly<Record<MissingField, Omit<MissingFieldMeta, "field">>> = {
  "vitals.warningAcknowledgment": { step: "vitals", labelKey: "clinical.missing.vitalsWarningAck", focusId: "vitals-warnings" },
  "assessment.chiefComplaint": { step: "assessment", labelKey: "clinical.missing.chiefComplaint", focusId: "assessment-chiefComplaint" },
  "assessment.assessmentType": { step: "assessment", labelKey: "clinical.missing.assessmentType", focusId: "assessment-assessmentType" },
  "assessment.assessmentText": { step: "assessment", labelKey: "clinical.missing.assessmentText", focusId: "assessment-assessmentText" },
  "prescription.mode": { step: "prescription", labelKey: "clinical.missing.prescriptionMode", focusId: "prescription-mode" },
  "prescription.items": { step: "prescription", labelKey: "clinical.missing.prescriptionItems", focusId: "prescription-add" },
  "prescription.itemName": { step: "prescription", labelKey: "clinical.missing.prescriptionItemName", focusId: "prescription-items" },
  "prescription.allergyReview": { step: "prescription", labelKey: "clinical.missing.allergyReview", focusId: "prescription-allergyReview" },
  "care.followUp": { step: "care", labelKey: "clinical.missing.followUp", focusId: "care-followUp" },
};

export const missingMeta = (fields: readonly MissingField[]): MissingFieldMeta[] =>
  // Ordered by step, then by declaration order inside the step.
  [...fields]
    .map((field) => ({ field, ...MISSING_FIELD_META[field] }))
    .sort((a, b) => stepIndex(a.step) - stepIndex(b.step));

// ---- Step status / rail -------------------------------------------------------------------
export type StepStatus = "not_started" | "in_progress" | "complete" | "needs_attention";

const VITAL_KEYS = ["temperature", "bloodPressure", "pulseBpm", "spo2Percent", "respiratoryRatePerMin", "heightCm", "weightKg"] as const;
const hasText = (v: string | undefined) => !!v && v.trim().length > 0;

function vitalsStarted(v: VitalsStep): boolean {
  return VITAL_KEYS.some((k) => v[k] !== undefined && v[k] !== null) || hasText(v.examinationFindings) || (v.notMeasured?.length ?? 0) > 0;
}
function assessmentStarted(a: AssessmentStep): boolean {
  return hasText(a.chiefComplaint) || hasText(a.symptomDuration) || hasText(a.examinationFindings) || !!a.assessmentType || hasText(a.assessmentText) || hasText(a.uncertaintyNote) || (a.differentials?.length ?? 0) > 0 || hasText(a.redFlags) || hasText(a.clinicianDecision);
}
function prescriptionStarted(p: PrescriptionStep): boolean {
  return p.prescription.mode !== "unset" || (p.testsAndReferrals?.length ?? 0) > 0;
}
function careStarted(c: CareStep): boolean {
  return hasText(c.advice) || hasText(c.redFlagsAdvice) || (!!c.followUp && c.followUp.mode !== "unset");
}

export function stepStatus(step: EditableStepId, content: ClinicalDraftContent, warnings: readonly VitalWarning[]): StepStatus {
  const missing = missingForFinalize(content, warnings).filter((m) => MISSING_FIELD_META[m].step === step);
  const started = {
    vitals: () => vitalsStarted(content.vitals),
    assessment: () => assessmentStarted(content.assessment),
    prescription: () => prescriptionStarted(content.prescription),
    care: () => careStarted(content.care),
  }[step]();
  if (step === "vitals" && unacknowledgedWarnings(warnings).length > 0) return "needs_attention";
  if (!started) return "not_started";
  return missing.length > 0 ? "in_progress" : "complete";
}

export type StepRailItem = { id: ClinicalStepId; labelKey: string; status: StepStatus | "ready" | "blocked"; current: boolean };

export function buildStepRail(content: ClinicalDraftContent, warnings: readonly VitalWarning[], current: ClinicalStepId): StepRailItem[] {
  const missing = missingForFinalize(content, warnings);
  return CLINICAL_STEPS.map((id) => ({
    id,
    labelKey: STEP_LABEL_KEYS[id],
    status: id === "review" ? (missing.length === 0 ? "ready" : "blocked") : stepStatus(id, content, warnings),
    current: id === current,
  }));
}

// ---- Per-step validation (field errors for the error summary) -----------------------------
const STEP_SCHEMAS: Readonly<Record<EditableStepId, z.ZodType>> = {
  vitals: vitalsStepSchema,
  assessment: assessmentStepSchema,
  prescription: prescriptionStepSchema,
  care: careStepSchema,
};

/** field path ("bloodPressure.systolicMmHg") -> stable code. Empty object means valid. */
export function validateStep(step: EditableStepId, value: unknown): Record<string, string> {
  const r = STEP_SCHEMAS[step].safeParse(value);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const path = issue.path.map(String).join(".") || "_";
    out[path] ??= issue.code;
  }
  return out;
}

/** Replace one step's content. Pure: never mutates the input. */
export function updateStep<S extends EditableStepId>(content: ClinicalDraftContent, step: S, value: ClinicalDraftContent[S]): ClinicalDraftContent {
  return { ...content, [step]: value };
}

// ---- Vitals helpers -----------------------------------------------------------------------
export type VitalKey = (typeof VITAL_KEYS)[number];

/** Mark a vital "not measured": clears its value (explicit) and records the choice. */
export function setNotMeasured(v: VitalsStep, key: VitalKey, notMeasured: boolean): VitalsStep {
  const list = new Set(v.notMeasured ?? []);
  if (notMeasured) list.add(key);
  else list.delete(key);
  return { ...v, [key]: notMeasured ? null : v[key], notMeasured: [...list] };
}

/** Setting a value un-marks "not measured". The value is stored exactly as entered. */
export function setVital<K extends VitalKey>(v: VitalsStep, key: K, value: VitalsStep[K]): VitalsStep {
  const list = (v.notMeasured ?? []).filter((k) => k !== key);
  return { ...v, [key]: value, notMeasured: list };
}

export function acknowledgeWarning(v: VitalsStep, ruleId: string): VitalsStep {
  const set = new Set(v.acknowledgedWarnings ?? []);
  set.add(ruleId);
  return { ...v, acknowledgedWarnings: [...set] };
}

export const vitalWarnings = (content: ClinicalDraftContent, rules: readonly VitalWarningRule[]) => evaluateVitalWarnings(content.vitals, rules);

// ---- Prescription helpers -----------------------------------------------------------------
export type KeyFactory = () => string;

/** Stable row keys. Uses crypto when available; keys are not server IDs and carry no data. */
export const defaultKeyFactory: KeyFactory = () => `r${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("")}`;

export const emptyMedicineLine = (key: string): MedicineLine => ({ key, name: "" });

export type ModeChange = { content: PrescriptionStep; discardsItems: number };

/**
 * Change the prescription mode. Switching away from "medicines" reports how many lines would
 * be discarded so the UI can ask for explicit confirmation before applying.
 */
export function changePrescriptionMode(p: PrescriptionStep, mode: Prescription["mode"]): ModeChange {
  const current = p.prescription;
  const discardsItems = current.mode === "medicines" && mode !== "medicines" ? current.items.length : 0;
  let next: Prescription;
  if (mode === "medicines") next = { mode: "medicines", items: current.mode === "medicines" ? current.items : [] };
  else if (mode === "none") next = { mode: "none", note: current.mode === "none" ? current.note : undefined };
  else next = { mode: "unset" };
  // Changing medicines invalidates a previous allergy acknowledgment.
  const allergyReview = mode === "medicines" && current.mode === "medicines" ? p.allergyReview : undefined;
  return { content: { ...p, prescription: next, allergyReview }, discardsItems };
}

function withItems(p: PrescriptionStep, items: MedicineLine[]): PrescriptionStep {
  // Any edit to medicine lines requires the clinician to re-review allergies.
  return { ...p, prescription: { mode: "medicines", items }, allergyReview: p.allergyReview ? { ...p.allergyReview, acknowledged: false } : undefined };
}

const items = (p: PrescriptionStep): MedicineLine[] => (p.prescription.mode === "medicines" ? p.prescription.items : []);

export const addMedicineLine = (p: PrescriptionStep, key: string): PrescriptionStep => withItems(p, [...items(p), emptyMedicineLine(key)]);
export const removeMedicineLine = (p: PrescriptionStep, key: string): PrescriptionStep => withItems(p, items(p).filter((i) => i.key !== key));
export const updateMedicineLine = (p: PrescriptionStep, key: string, patch: Partial<Omit<MedicineLine, "key">>): PrescriptionStep =>
  withItems(p, items(p).map((i) => (i.key === key ? { ...i, ...patch } : i)));

export function moveMedicineLine(p: PrescriptionStep, key: string, direction: -1 | 1): PrescriptionStep {
  const list = [...items(p)];
  const i = list.findIndex((x) => x.key === key);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return p;
  [list[i], list[j]] = [list[j], list[i]];
  return withItems(p, list);
}

export const addTestOrReferral = (p: PrescriptionStep, row: TestOrReferral): PrescriptionStep => ({ ...p, testsAndReferrals: [...(p.testsAndReferrals ?? []), row] });
export const removeTestOrReferral = (p: PrescriptionStep, key: string): PrescriptionStep => ({ ...p, testsAndReferrals: (p.testsAndReferrals ?? []).filter((r) => r.key !== key) });

export function acknowledgeAllergyReview(p: PrescriptionStep, reviewedFactVersions: string[]): PrescriptionStep {
  return { ...p, allergyReview: { acknowledged: true, reviewedFactVersions } };
}

export const setFollowUp = (c: CareStep, followUp: FollowUp): CareStep => ({ ...c, followUp });

// ---- Context header -----------------------------------------------------------------------
export type AllergyBanner =
  /** Server has allergy facts: show them and the review requirement. */
  | { kind: "known"; items: { value: string; verified: boolean }[] }
  /** Server explicitly says none are recorded. Not the same as "no allergies". */
  | { kind: "none_recorded" }
  /** Server does not know / facts not loaded: show as unknown, never as "no allergies". */
  | { kind: "unknown" };

export type AllergyFactInput = { value: string; verified: boolean };

export function allergyBanner(hasKnownAllergies: boolean | null, facts: readonly AllergyFactInput[] | null): AllergyBanner {
  if (facts && facts.length > 0) return { kind: "known", items: facts.map((f) => ({ ...f })) };
  if (hasKnownAllergies === true) return { kind: "unknown" }; // flag says yes but details unavailable
  if (hasKnownAllergies === false) return { kind: "none_recorded" };
  return { kind: "unknown" };
}

// ---- Review summary -----------------------------------------------------------------------
export type ReviewSummary = {
  missing: MissingFieldMeta[];
  warnings: VitalWarning[];
  canSign: boolean;
  vitals: VitalsStep;
  assessment: AssessmentStep;
  prescription: { mode: Prescription["mode"]; items: MedicineLine[]; tests: TestOrReferral[]; allergyReviewed: boolean };
  care: CareStep;
};

/** Values are passed through exactly as entered; the UI renders, never reformats doses/units. */
export function buildReviewSummary(content: ClinicalDraftContent, warnings: readonly VitalWarning[]): ReviewSummary {
  const missing = missingMeta(missingForFinalize(content, warnings));
  const p = content.prescription;
  return {
    missing,
    warnings: [...warnings],
    canSign: missing.length === 0,
    vitals: content.vitals,
    assessment: content.assessment,
    prescription: { mode: p.prescription.mode, items: items(p), tests: p.testsAndReferrals ?? [], allergyReviewed: !!p.allergyReview?.acknowledged },
    care: content.care,
  };
}
