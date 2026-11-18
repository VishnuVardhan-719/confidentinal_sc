import { z } from "zod";
import { categorySchema, paiseSchema, pinSchema, utcSchema, versionSchema } from "@/modules/catalog/schemas";

/** Profile items the server tracks. Health items live in a separate record, unverified until a doctor confirms in person. */
export const IDENTITY_ITEMS = ["fullName", "email", "mobileVerified", "dateOfBirth", "gender", "address", "city", "state", "pin", "pinnedLocation", "photo"] as const;
export const HEALTH_ITEMS = ["bloodGroup", "heightCm", "weightKg", "allergies", "medicalHistory", "currentMedicines", "previousSurgeries"] as const;
export const PROFILE_ITEM_KEYS = [...IDENTITY_ITEMS, ...HEALTH_ITEMS] as const;
export type ProfileItemKey = (typeof PROFILE_ITEM_KEYS)[number];
/** The server decides which items are required; the browser only counts what it is told. */
export const completionItemSchema = z.object({ key: z.enum(PROFILE_ITEM_KEYS), required: z.boolean(), done: z.boolean() });
export type CompletionItem = z.infer<typeof completionItemSchema>;
const completionListSchema = z.array(completionItemSchema).max(PROFILE_ITEM_KEYS.length)
  .refine(items => new Set(items.map(item => item.key)).size === items.length, "duplicate_item");
/** Server-derived completion only. "unknown" means the server did not say; never treat it as complete. */
export const patientOverviewSchema = z.object({
  questionnaire: z.enum(["complete", "incomplete", "unknown"]),
  completion: completionListSchema,
  synthetic: z.boolean(),
});
export type PatientOverview = z.infer<typeof patientOverviewSchema>;

/** Self plus explicitly granted family members. Booking permission never implies record access. */
export const patientMemberSchema = z.object({
  patientId: z.uuid(), relation: z.enum(["self", "family"]), displayName: z.string().min(1).max(80),
  canBook: z.boolean(), canViewRecords: z.boolean(), profile: completionListSchema, synthetic: z.boolean(),
});
export type PatientMember = z.infer<typeof patientMemberSchema>;

/** Minimal address projection for selection; full line text stays with the server. */
export const patientAddressSchema = z.object({
  id: z.uuid(), label: z.enum(["home", "work", "other"]), locality: z.string().min(1).max(80), city: z.string().min(1).max(60),
  pin: pinSchema, synthetic: z.boolean(),
});
export type PatientAddress = z.infer<typeof patientAddressSchema>;
/** A new visit address typed by the patient. Locality and city are short labels; the PIN must be a valid Indian PIN. */
export const newAddressSchema = z.strictObject({
  label: z.enum(["home", "work", "other"]),
  locality: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  pin: pinSchema,
});
export type NewAddress = z.infer<typeof newAddressSchema>;

export const offerRequestSchema = z.strictObject({
  providerId: z.uuid(), serviceId: z.uuid(), category: categorySchema, pin: pinSchema, startAt: utcSchema, endAt: utcSchema,
});
export type OfferRequest = z.input<typeof offerRequestSchema>;

/** Server-issued price + policy for one schedule. The browser displays it; it never computes or sends a price. */
export const bookingOfferSchema = z.object({
  providerId: z.uuid(), serviceId: z.uuid(), startAt: utcSchema, endAt: utcSchema,
  priceSnapshot: z.object({ amountPaise: paiseSchema, currency: z.literal("INR"), termsVersion: z.string().min(1), policyVersionId: z.uuid() }),
  unit: z.enum(["visit", "test", "trip", "hour", "day"]),
  policy: z.object({ id: z.uuid(), version: z.string().min(1), approved: z.boolean(), cancelWindowMinutes: z.number().int().min(0).max(10080) }),
  noticeVersion: z.string().min(1), eligibilityVersion: versionSchema,
  paymentMethods: z.array(z.enum(["pay_after", "online_test"])).min(1),
  synthetic: z.boolean(),
});
export type BookingOffer = z.infer<typeof bookingOfferSchema>;
