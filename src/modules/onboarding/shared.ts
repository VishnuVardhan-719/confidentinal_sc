import { z } from "zod";
import { documentKindSchema, type DocumentKind } from "@/modules/verification/schemas";

/** Indian PIN code: six digits, first non-zero. */
export const pinCodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, { message: "pin_invalid" });

export const pinListSchema = z
  .array(pinCodeSchema)
  .min(1, { message: "pin_required" })
  .max(200)
  .refine((pins) => new Set(pins).size === pins.length, { message: "pin_duplicate" });

/** Integer paise. Display formatting belongs to the UI (Intl, INR). Server derives booking prices. */
export const paiseSchema = z.int({ message: "amount_invalid" }).positive({ message: "amount_invalid" }).max(100_000_000);

export const shortText = (max: number) => z.string().trim().min(1, { message: "required" }).max(max);
export const optionalText = (max: number) => z.string().trim().max(max).optional();

/** ISO 639 language code (en, te, hi, ta, ...). */
export const languagesSchema = z
  .array(z.string().regex(/^[a-z]{2,3}$/, { message: "language_invalid" }))
  .min(1, { message: "language_required" })
  .max(20)
  .refine((l) => new Set(l).size === l.length, { message: "language_duplicate" });

export const yearSchema = z
  .int()
  .min(1900)
  .refine((y) => y <= new Date().getUTCFullYear(), { message: "year_in_future" });

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "time_invalid" });

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const hoursWindowSchema = z
  .strictObject({ day: z.enum(WEEKDAYS), opens: timeOfDaySchema, closes: timeOfDaySchema })
  .refine((w) => w.opens < w.closes, { message: "hours_order", path: ["closes"] });

/** Weekly hours in Asia/Kolkata wall time. Same-day windows must not overlap. */
export const weeklyHoursSchema = z
  .array(hoursWindowSchema)
  .min(1, { message: "hours_required" })
  .max(28)
  .refine(
    (windows) => {
      const sorted = [...windows].sort((a, b) => (a.day === b.day ? a.opens.localeCompare(b.opens) : a.day.localeCompare(b.day)));
      return sorted.every((w, i) => i === 0 || sorted[i - 1].day !== w.day || sorted[i - 1].closes <= w.opens);
    },
    { message: "hours_overlap" },
  );

/** Reference to private evidence already registered via the documents endpoint (server-issued ID). */
export const documentRefSchema = z.strictObject({ kind: documentKindSchema, documentId: z.uuid() });
export type DocumentRef = z.infer<typeof documentRefSchema>;

/** Evidence list that must contain every `required` kind (I02 `required_kind` per category). */
export const evidenceSchema = (required: readonly DocumentKind[]) =>
  z.strictObject({
    documents: z
      .array(documentRefSchema)
      .min(1, { message: "documents_required" })
      .max(20)
      .refine((docs) => new Set(docs.map((d) => d.documentId)).size === docs.length, { message: "document_duplicate" })
      .refine((docs) => required.every((kind) => docs.some((d) => d.kind === kind)), {
        message: "required_document_missing",
      }),
  });

/** Indian mobile in E.164 (fictional example +919000000000). */
export const contactPhoneSchema = z.string().trim().regex(/^\+91[6-9]\d{9}$/, { message: "phone_invalid" });

/** Public listing shared by every provider category (I02 `provider_profiles`). */
export const listingSchema = z.strictObject({
  displayName: shortText(160),
  description: z.string().trim().max(2000).default(""),
});
