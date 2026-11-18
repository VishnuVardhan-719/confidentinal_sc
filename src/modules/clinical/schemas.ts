import { z } from "zod";

/**
 * Clinical editor schemas (five steps). PROPOSED, pending backend contract and clinical sign-off.
 *
 * Rules applied here:
 * - Draft schemas are lenient: every field may be missing so autosave never blocks on partial work.
 * - No clinical thresholds are invented. Values are structural only (finite, non-negative, bounded
 *   string length). Plausibility/danger warnings come from approved rules passed in at runtime.
 * - Entered values are preserved exactly; schemas never coerce, round or convert units.
 * - Free text is clinician-authored; nothing here generates diagnoses or medication content.
 */

const text = (max: number) => z.string().max(max);
const optText = (max: number) => text(max).optional();
const measure = z.number().finite().nonnegative();
const optMeasure = measure.nullable().optional();
/** Stable client-side key for repeatable rows (ordering + React keys). Not a server ID. */
const rowKey = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

// ---- Step 1: vitals & examination --------------------------------------------------------
export const TEMPERATURE_UNITS = ["C", "F"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const temperatureSchema = z.strictObject({
  value: measure,
  /** Unit is mandatory whenever a value is recorded. No silent conversion. */
  unit: z.enum(TEMPERATURE_UNITS),
});

export const bloodPressureSchema = z.strictObject({
  systolicMmHg: measure.int(),
  diastolicMmHg: measure.int(),
});

export const vitalsStepSchema = z.strictObject({
  temperature: temperatureSchema.nullable().optional(),
  bloodPressure: bloodPressureSchema.nullable().optional(),
  pulseBpm: measure.int().nullable().optional(),
  spo2Percent: measure.max(100).nullable().optional(),
  respiratoryRatePerMin: measure.int().nullable().optional(),
  heightCm: optMeasure,
  weightKg: optMeasure,
  examinationFindings: optText(8000),
  /** Fields the clinician explicitly marked as not measured / unknown. */
  notMeasured: z
    .array(z.enum(["temperature", "bloodPressure", "pulseBpm", "spo2Percent", "respiratoryRatePerMin", "heightCm", "weightKg"]))
    .optional(),
  /** IDs of approved warning rules the clinician acknowledged. Values are never altered. */
  acknowledgedWarnings: z.array(z.string().max(64)).optional(),
});
export type VitalsStep = z.infer<typeof vitalsStepSchema>;

// ---- Step 2: assessment ------------------------------------------------------------------
export const ASSESSMENT_TYPES = ["provisional", "final"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const assessmentStepSchema = z.strictObject({
  chiefComplaint: optText(2000),
  symptomDuration: optText(200),
  examinationFindings: optText(8000),
  assessmentType: z.enum(ASSESSMENT_TYPES).optional(),
  /** Clinician-authored assessment. Optional for provisional: no forced definitive diagnosis. */
  assessmentText: optText(4000),
  uncertaintyNote: optText(2000),
  differentials: z.array(text(500)).max(20).optional(),
  redFlags: optText(2000),
  clinicianDecision: optText(2000),
});
export type AssessmentStep = z.infer<typeof assessmentStepSchema>;

// ---- Step 3: prescription & tests --------------------------------------------------------
export const medicineLineSchema = z.strictObject({
  key: rowKey,
  name: text(200),
  formulationStrength: optText(200),
  dose: optText(200),
  route: optText(100),
  frequency: optText(200),
  duration: optText(200),
  quantity: optText(100),
  instructions: optText(1000),
});
export type MedicineLine = z.infer<typeof medicineLineSchema>;

export const testOrReferralSchema = z.strictObject({
  key: rowKey,
  kind: z.enum(["test", "referral"]),
  description: text(500),
});
export type TestOrReferral = z.infer<typeof testOrReferralSchema>;

export const prescriptionSchema = z.discriminatedUnion("mode", [
  /** The clinician has not yet chosen. Blocks finalization. */
  z.strictObject({ mode: z.literal("unset") }),
  /** Explicit "No medicine prescribed" is a valid, complete choice. */
  z.strictObject({ mode: z.literal("none"), note: optText(1000) }),
  z.strictObject({ mode: z.literal("medicines"), items: z.array(medicineLineSchema).max(30) }),
]);
export type Prescription = z.infer<typeof prescriptionSchema>;

export const allergyReviewSchema = z.strictObject({
  /** Clinician confirms they reviewed the known allergies shown in the context header. */
  acknowledged: z.boolean(),
  /** Server-reported allergy fact versions that were on screen at acknowledgment time. */
  reviewedFactVersions: z.array(z.string().max(64)).max(50).optional(),
});

export const prescriptionStepSchema = z.strictObject({
  prescription: prescriptionSchema,
  testsAndReferrals: z.array(testOrReferralSchema).max(30).optional(),
  allergyReview: allergyReviewSchema.optional(),
});
export type PrescriptionStep = z.infer<typeof prescriptionStepSchema>;

// ---- Step 4: care instructions & follow-up -----------------------------------------------
export const followUpSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("unset") }),
  z.strictObject({ mode: z.literal("not_required") }),
  z.strictObject({
    mode: z.literal("recommended"),
    /** Calendar date (Asia/Kolkata) recommended by the clinician; optional. */
    date: z.iso.date().optional(),
    note: optText(1000),
  }),
]);
export type FollowUp = z.infer<typeof followUpSchema>;

export const careStepSchema = z.strictObject({
  advice: optText(4000),
  redFlagsAdvice: optText(2000),
  followUp: followUpSchema.optional(),
});
export type CareStep = z.infer<typeof careStepSchema>;

// ---- Whole draft -------------------------------------------------------------------------
export const clinicalDraftContentSchema = z.strictObject({
  vitals: vitalsStepSchema,
  assessment: assessmentStepSchema,
  prescription: prescriptionStepSchema,
  care: careStepSchema,
});
export type ClinicalDraftContent = z.infer<typeof clinicalDraftContentSchema>;

export const emptyDraftContent = (): ClinicalDraftContent => ({
  vitals: {},
  assessment: {},
  prescription: { prescription: { mode: "unset" } },
  care: {},
});

// ---- Step 5: review & sign ---------------------------------------------------------------
export const signRequestSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  /** Explicit acknowledgment of the irreversible signed version. */
  acknowledged: z.literal(true),
});
export type SignRequest = z.infer<typeof signRequestSchema>;

export const saveDraftRequestSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  content: clinicalDraftContentSchema,
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

// ---- Amendment ---------------------------------------------------------------------------
export const AMENDMENT_REASONS = ["correction", "additional_information", "patient_reported_update", "other"] as const;
export type AmendmentReason = (typeof AMENDMENT_REASONS)[number];

export const amendmentRequestSchema = z.strictObject({
  /** The signed version being amended. Server rejects if it is not the latest. */
  baseVersion: z.number().int().positive(),
  reason: z.enum(AMENDMENT_REASONS),
  /** Mandatory clinician explanation. Amendments are append-only, never silent edits. */
  reasonText: z.string().trim().min(10).max(2000),
  /** Full replacement content for the new version (the prior version is kept unchanged). */
  content: clinicalDraftContentSchema,
  acknowledged: z.literal(true),
});
export type AmendmentRequest = z.infer<typeof amendmentRequestSchema>;

// ---- Finalization readiness --------------------------------------------------------------
export type MissingField =
  | "assessment.chiefComplaint"
  | "assessment.assessmentType"
  | "assessment.assessmentText"
  | "prescription.mode"
  | "prescription.items"
  | "prescription.itemName"
  | "prescription.allergyReview"
  | "care.followUp"
  | "vitals.warningAcknowledgment";

/**
 * Required-field check shown on the Review step. PROPOSED minimum, pending clinical governance.
 * Deliberately does NOT require: any vital, a definitive diagnosis for provisional assessments,
 * medicines, tests, or photos.
 */
export function missingForFinalize(content: ClinicalDraftContent, vitalWarnings: readonly VitalWarning[] = []): MissingField[] {
  const missing: MissingField[] = [];
  if (unacknowledgedWarnings(vitalWarnings).length > 0) missing.push("vitals.warningAcknowledgment");
  const a = content.assessment;
  if (!a.chiefComplaint?.trim()) missing.push("assessment.chiefComplaint");
  if (!a.assessmentType) missing.push("assessment.assessmentType");
  if (a.assessmentType === "final" && !a.assessmentText?.trim()) missing.push("assessment.assessmentText");

  const p = content.prescription.prescription;
  if (p.mode === "unset") missing.push("prescription.mode");
  if (p.mode === "medicines") {
    if (p.items.length === 0) missing.push("prescription.items");
    if (p.items.some((i) => !i.name.trim())) missing.push("prescription.itemName");
    if (!content.prescription.allergyReview?.acknowledged) missing.push("prescription.allergyReview");
  }
  if (!content.care.followUp || content.care.followUp.mode === "unset") missing.push("care.followUp");
  return missing;
}

// ---- Approved vital warning rules (injected, never hardcoded) ----------------------------
export type VitalMetric = "temperatureC" | "temperatureF" | "systolic" | "diastolic" | "pulseBpm" | "spo2Percent" | "respiratoryRatePerMin";

/** Supplied by approved clinical governance config from the server. No defaults ship here. */
export type VitalWarningRule = {
  id: string;
  metric: VitalMetric;
  below?: number;
  above?: number;
  severity: "implausible" | "danger";
  requiresAcknowledgment: boolean;
  labelKey: string;
};

export type VitalWarning = { ruleId: string; metric: VitalMetric; value: number; severity: VitalWarningRule["severity"]; labelKey: string; acknowledged: boolean; requiresAcknowledgment: boolean };

function metricValues(v: VitalsStep): Partial<Record<VitalMetric, number>> {
  const out: Partial<Record<VitalMetric, number>> = {};
  if (v.temperature) out[v.temperature.unit === "C" ? "temperatureC" : "temperatureF"] = v.temperature.value;
  if (v.bloodPressure) {
    out.systolic = v.bloodPressure.systolicMmHg;
    out.diastolic = v.bloodPressure.diastolicMmHg;
  }
  if (typeof v.pulseBpm === "number") out.pulseBpm = v.pulseBpm;
  if (typeof v.spo2Percent === "number") out.spo2Percent = v.spo2Percent;
  if (typeof v.respiratoryRatePerMin === "number") out.respiratoryRatePerMin = v.respiratoryRatePerMin;
  return out;
}

/** Pure: returns warnings; never modifies the entered vitals. */
export function evaluateVitalWarnings(vitals: VitalsStep, rules: readonly VitalWarningRule[]): VitalWarning[] {
  const values = metricValues(vitals);
  const acked = new Set(vitals.acknowledgedWarnings ?? []);
  const warnings: VitalWarning[] = [];
  for (const rule of rules) {
    const value = values[rule.metric];
    if (value === undefined) continue;
    const hit = (rule.below !== undefined && value < rule.below) || (rule.above !== undefined && value > rule.above);
    if (!hit) continue;
    warnings.push({
      ruleId: rule.id,
      metric: rule.metric,
      value,
      severity: rule.severity,
      labelKey: rule.labelKey,
      acknowledged: acked.has(rule.id),
      requiresAcknowledgment: rule.requiresAcknowledgment,
    });
  }
  return warnings;
}

export const unacknowledgedWarnings = (w: readonly VitalWarning[]) => w.filter((x) => x.requiresAcknowledgment && !x.acknowledged);
