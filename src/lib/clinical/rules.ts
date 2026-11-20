// DC04/DC06/DC08 content rules. Must equal clinical_private.rules() in
// supabase/migrations/20261117002300_dc_clinical_model.sql (parity test in tests/unit/clinical.test.ts).
// Vital thresholds are defaults awaiting clinical sign-off (design DCQ-2). Hard limits reject a
// value; warning limits keep the value as entered and require an acknowledgment at signing.
export const CLINICAL_RULES = {
  vitals: {
    temperature_c: { min: 25, max: 45, decimals: 1, code: "temperature", warn_below: 35, warn_from: 39.5 },
    temperature_f: { min: 77, max: 113, decimals: 1, code: "temperature", warn_below: 95, warn_from: 103.1 },
    systolic: { min: 40, max: 300, decimals: 0, code: "systolic", warn_below: 90, warn_from: 180 },
    diastolic: { min: 20, max: 200, decimals: 0, code: "diastolic", warn_from: 120 },
    pulse_bpm: { min: 20, max: 250, decimals: 0, code: "pulse", warn_below: 40, warn_from: 131 },
    spo2_pct: { min: 50, max: 100, decimals: 0, code: "spo2", warn_below: 92 },
    resp_rate: { min: 4, max: 70, decimals: 0, code: "resp_rate", warn_below: 8, warn_from: 31 },
    height_cm: { min: 30, max: 250, decimals: 1 },
    weight_kg: { min: 0.5, max: 400, decimals: 1 },
  },
  numbers: {
    duration_days: { min: 1, max: 365, decimals: 0 },
    quantity: { min: 1, max: 1000, decimals: 0 },
  },
  text: {
    chief_complaint: 500, symptom_duration: 100, findings: 4000, summary: 2000, diagnosis_label: 200, list_item: 200,
    substance: 100, reaction: 200, medication_name: 200, strength: 100, dose: 100, instructions: 500, override_reason: 300,
    advice: 2000, follow_up_note: 500, test_name: 200, test_reason: 300, referral: 500, red_flag_advice: 1000, amendment_reason: 500,
  },
  lists: { diagnoses: 10, differentials: 10, red_flags: 10, allergies: 20, prescription_items: 15, tests: 10, acknowledged_warnings: 10 },
  enums: {
    temperature_unit: ["C", "F"],
    assessment_certainty: ["provisional", "final", "undetermined"],
    diagnosis_certainty: ["suspected", "probable", "confirmed"],
    outcome: ["self_care", "follow_up", "tests_advised", "referred", "emergency_referral"],
    allergy_status: ["none_known", "recorded", "not_assessed"],
    prescription_status: ["none_indicated", "prescribed"],
    form: ["tablet", "capsule", "syrup", "suspension", "injection", "ointment", "cream", "gel", "drops", "inhaler", "powder", "other"],
    route: ["oral", "sublingual", "topical", "inhaled", "nasal", "ophthalmic", "otic", "intramuscular", "intravenous", "subcutaneous", "rectal", "other"],
    frequency: ["once_daily", "twice_daily", "three_times_daily", "four_times_daily", "every_4_hours", "every_6_hours", "every_8_hours",
      "at_bedtime", "as_needed", "single_dose", "other"],
    vital_warnings: ["temperature_low", "temperature_high", "systolic_low", "systolic_high", "diastolic_high", "pulse_low", "pulse_high",
      "spo2_low", "resp_rate_low", "resp_rate_high"],
  },
  patterns: {
    diagnosis_code: "^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$",
    date: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
  },
} as const;

type Limit = { min: number; max: number; decimals: number; code?: string; warn_below?: number; warn_from?: number };
export type VitalWarning = (typeof CLINICAL_RULES.enums.vital_warnings)[number];

// Same order as the loop in clinical_private.vital_warnings (parity test).
export const VITAL_WARNING_ORDER = ["temperature", "systolic", "diastolic", "pulse_bpm", "spo2_pct", "resp_rate"] as const;

export function inLimit(value: number, limit: Limit) {
  if (!Number.isFinite(value) || value < limit.min || value > limit.max) return false;
  const scaled = value * 10 ** limit.decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

type Vitals = Partial<Record<"systolic" | "diastolic" | "pulse_bpm" | "spo2_pct" | "resp_rate", number>> & {
  temperature?: { value: number; unit: "C" | "F" };
};

/** Warning codes for plausible but out-of-range readings, in the database order. */
export function vitalWarnings(vitals: Vitals | undefined): VitalWarning[] {
  const out: string[] = [];
  if (!vitals) return [];
  for (const key of VITAL_WARNING_ORDER) {
    let value: number | undefined;
    let limit: Limit;
    if (key === "temperature") {
      value = vitals.temperature?.value;
      limit = vitals.temperature?.unit === "F" ? CLINICAL_RULES.vitals.temperature_f : CLINICAL_RULES.vitals.temperature_c;
    } else {
      value = vitals[key];
      limit = CLINICAL_RULES.vitals[key];
    }
    if (typeof value !== "number") continue;
    if (limit.warn_below !== undefined && value < limit.warn_below) out.push(`${limit.code}_low`);
    if (limit.warn_from !== undefined && value >= limit.warn_from) out.push(`${limit.code}_high`);
  }
  return out as VitalWarning[];
}

// Postgres btrim(text) trims spaces only.
const btrim = (s: string) => s.replace(/^ +| +$/g, "");

type Named = { medication_name?: string };
type Substance = { substance?: string };
/**
 * 1-based prescription lines whose medication name and a recorded allergy substance contain
 * one another (case-insensitive, 3+ characters). A name match only: it does not know drug
 * classes, so amoxicillin is not matched against penicillin (design DCQ-6).
 */
export function allergyConflicts(content: { prescription?: { items?: Named[] }; allergies?: { items?: Substance[] } }): number[] {
  const items = content.prescription?.items ?? [];
  const allergies = content.allergies?.items ?? [];
  const lines: number[] = [];
  items.forEach((item, index) => {
    if (typeof item.medication_name !== "string") return;
    const name = item.medication_name.toLowerCase();
    const trimmed = btrim(item.medication_name).toLowerCase();
    const hit = allergies.some(a => {
      if (typeof a.substance !== "string") return false;
      const substance = btrim(a.substance).toLowerCase();
      if (substance.length < 3 || trimmed.length < 3) return false;
      return name.includes(substance) || substance.includes(trimmed);
    });
    if (hit) lines.push(index + 1);
  });
  return lines;
}
