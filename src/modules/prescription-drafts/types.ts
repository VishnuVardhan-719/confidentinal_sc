import { z } from "zod";

/**
 * Prescription DRAFTS for a completed booking. Template-only: the doctor types the medicine name
 * (no drug database, lookup or suggestions) and picks form, schedule, duration and instruction from
 * fixed templates. A draft is never issued: there is no issue/send action, it never reaches the
 * patient or a pharmacy (pharmacy and clinical production stay disabled). Fixture only.
 */
export const MEDICINE_FORMS = ["tablet", "capsule", "syrup", "drops", "ointment", "inhaler", "other"] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];

export const SCHEDULE_TEMPLATES = ["once_daily", "twice_daily", "three_times_daily", "at_bedtime", "as_needed"] as const;
export type ScheduleTemplate = (typeof SCHEDULE_TEMPLATES)[number];

export const INSTRUCTION_TEMPLATES = ["after_food", "before_food", "with_water", "apply_thin_layer", "none"] as const;
export type InstructionTemplate = (typeof INSTRUCTION_TEMPLATES)[number];

export const MAX_ITEMS = 10;
export const MAX_DURATION_DAYS = 90;

const isoTime = z.iso.datetime({ offset: true });

export const draftItemSchema = z.strictObject({
  /** Client-generated stable key for list rendering; not an identifier of anything else. */
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  medicineName: z.string().trim().min(1).max(120),
  form: z.enum(MEDICINE_FORMS),
  /** Free text such as "500 mg"; optional. */
  strength: z.string().trim().max(40),
  schedule: z.enum(SCHEDULE_TEMPLATES),
  durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS),
  instruction: z.enum(INSTRUCTION_TEMPLATES),
});
export type DraftItem = z.infer<typeof draftItemSchema>;

export const prescriptionDraftSchema = z.strictObject({
  bookingId: z.string().min(1),
  /** Always a draft. There is deliberately no "issued" state on the frontend. */
  status: z.literal("draft"),
  version: z.number().int().positive(),
  items: z.array(draftItemSchema).max(MAX_ITEMS),
  updatedAt: isoTime,
});
export type PrescriptionDraft = z.infer<typeof prescriptionDraftSchema>;

export const saveDraftInputSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  items: z.array(draftItemSchema).min(1).max(MAX_ITEMS),
});
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;

export const discardDraftInputSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export type DiscardDraftInput = z.infer<typeof discardDraftInputSchema>;

/** Editable row before validation: duration is the raw text the doctor typed. */
export type DraftRow = Omit<DraftItem, "durationDays" | "form" | "schedule" | "instruction"> & {
  durationText: string;
  form: MedicineForm | "";
  schedule: ScheduleTemplate | "";
  instruction: InstructionTemplate | "";
};

export type RowError = "medicineName" | "form" | "schedule" | "durationDays" | "instruction" | "strength";

/** Validate one editable row; returns the item or the list of invalid fields (display order). */
export function parseRow(row: DraftRow): { ok: true; item: DraftItem } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = [];
  const name = row.medicineName.trim();
  if (name.length < 1 || name.length > 120) errors.push("medicineName");
  if (!row.form) errors.push("form");
  if (row.strength.trim().length > 40) errors.push("strength");
  if (!row.schedule) errors.push("schedule");
  const d = /^\d{1,3}$/.test(row.durationText.trim()) ? Number(row.durationText.trim()) : NaN;
  if (!Number.isInteger(d) || d < 1 || d > MAX_DURATION_DAYS) errors.push("durationDays");
  if (!row.instruction) errors.push("instruction");
  if (errors.length > 0) return { ok: false, errors };
  const parsed = draftItemSchema.safeParse({ key: row.key, medicineName: name, form: row.form, strength: row.strength.trim(), schedule: row.schedule, durationDays: d, instruction: row.instruction });
  return parsed.success ? { ok: true, item: parsed.data } : { ok: false, errors: ["medicineName"] };
}

export const rowFromItem = (i: DraftItem): DraftRow => ({ ...i, durationText: String(i.durationDays) });
export const emptyRow = (key: string): DraftRow => ({ key, medicineName: "", form: "", strength: "", schedule: "", durationText: "", instruction: "" });
