import { z } from "zod";
import { CLINICAL_RULES as R, inLimit } from "@/lib/clinical/rules";
import { versionSchema } from "./booking";

// Route-side mirror of clinical_private.check_content(content, false). The database check is
// the authority; this one rejects bad input before the RPC. Every field is optional in a draft
// (DC05 saves partial work); signing adds the required fields in the database.
type TextKey = keyof typeof R.text;
type Limit = { min: number; max: number; decimals: number };
const text = (key: TextKey) => z.string().max(R.text[key]).refine(s => s.trim().length > 0);
const num = (limit: Limit) => z.number().refine(n => inLimit(n, limit));
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max);

const temperatureSchema = z.strictObject({ value: z.number(), unit: z.enum(R.enums.temperature_unit) })
  .refine(t => inLimit(t.value, t.unit === "F" ? R.vitals.temperature_f : R.vitals.temperature_c));

export const vitalsSchema = z.strictObject({
  temperature: temperatureSchema.optional(),
  systolic: num(R.vitals.systolic).optional(),
  diastolic: num(R.vitals.diastolic).optional(),
  pulse_bpm: num(R.vitals.pulse_bpm).optional(),
  spo2_pct: num(R.vitals.spo2_pct).optional(),
  resp_rate: num(R.vitals.resp_rate).optional(),
  height_cm: num(R.vitals.height_cm).optional(),
  weight_kg: num(R.vitals.weight_kg).optional(),
  acknowledged_warnings: list(z.enum(R.enums.vital_warnings), R.lists.acknowledged_warnings)
    .refine(a => new Set(a).size === a.length).optional(),
}).refine(v => (v.systolic === undefined) === (v.diastolic === undefined))
  .refine(v => v.systolic === undefined || v.diastolic === undefined || v.diastolic < v.systolic);

const examinationSchema = z.strictObject({
  chief_complaint: text("chief_complaint").optional(),
  symptom_duration: text("symptom_duration").optional(),
  findings: text("findings").optional(),
});

const assessmentSchema = z.strictObject({
  summary: text("summary").optional(),
  certainty: z.enum(R.enums.assessment_certainty).optional(),
  diagnoses: list(z.strictObject({
    label: text("diagnosis_label").optional(),
    code: z.string().regex(new RegExp(R.patterns.diagnosis_code)).optional(),
    certainty: z.enum(R.enums.diagnosis_certainty).optional(),
  }), R.lists.diagnoses).optional(),
  differentials: list(text("list_item"), R.lists.differentials).optional(),
  red_flags: list(text("list_item"), R.lists.red_flags).optional(),
  outcome: z.enum(R.enums.outcome).optional(),
});

const allergiesSchema = z.strictObject({
  status: z.enum(R.enums.allergy_status).optional(),
  items: list(z.strictObject({ substance: text("substance").optional(), reaction: text("reaction").optional() }), R.lists.allergies).optional(),
});

export const prescriptionItemSchema = z.strictObject({
  medication_name: text("medication_name").optional(),
  form: z.enum(R.enums.form).optional(),
  strength: text("strength").optional(),
  dose: text("dose").optional(),
  route: z.enum(R.enums.route).optional(),
  frequency: z.enum(R.enums.frequency).optional(),
  duration_days: num(R.numbers.duration_days).optional(),
  quantity: num(R.numbers.quantity).optional(),
  instructions: text("instructions").optional(),
  allergy_override_reason: text("override_reason").optional(),
});

const prescriptionSchema = z.strictObject({
  status: z.enum(R.enums.prescription_status).optional(),
  items: list(prescriptionItemSchema, R.lists.prescription_items).optional(),
});

// Same rule as clinical_private.date_ok: YYYY-MM-DD and a real calendar date.
const dateSchema = z.string().regex(new RegExp(R.patterns.date)).refine(s => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});

const planSchema = z.strictObject({
  advice: text("advice").optional(),
  follow_up_on: dateSchema.optional(),
  follow_up_note: text("follow_up_note").optional(),
  tests: list(z.strictObject({ name: text("test_name").optional(), reason: text("test_reason").optional() }), R.lists.tests).optional(),
  referral: text("referral").optional(),
  red_flag_advice: text("red_flag_advice").optional(),
});

export const clinicalContentSchema = z.strictObject({
  vitals: vitalsSchema.optional(),
  examination: examinationSchema.optional(),
  assessment: assessmentSchema.optional(),
  allergies: allergiesSchema.optional(),
  prescription: prescriptionSchema.optional(),
  plan: planSchema.optional(),
});
export type ClinicalContent = z.infer<typeof clinicalContentSchema>;

// expectedVersion 0 creates the draft; later saves send the current draft version.
export const draftSaveSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2_147_483_645),
  content: clinicalContentSchema,
});
// The clinician must confirm authorship; allergy review is required by the database when the
// prescription has items.
export const signSchema = z.strictObject({
  expectedVersion: versionSchema,
  authoredConfirmed: z.literal(true),
  allergiesReviewed: z.boolean(),
});
export const amendSchema = z.strictObject({
  content: clinicalContentSchema,
  reason: text("amendment_reason"),
  authoredConfirmed: z.literal(true),
  allergiesReviewed: z.boolean(),
});
