import { z } from "zod";
import { categorySchema, pinSchema, utcSchema, versionSchema } from "@/modules/catalog/schemas";
import { bookingSchema, bookingStatusSchema, priceSnapshotSchema } from "./schemas";
export const serviceStepSchema = z.strictObject({ providerId: z.uuid(), serviceId: z.uuid(), category: categorySchema });
export const patientStepSchema = z.strictObject({ patientId: z.uuid(), questionnaireComplete: z.literal(true), access: z.enum(["self", "authorized_family"]) });
export const locationStepSchema = z.strictObject({ addressId: z.uuid(), pin: pinSchema });
export const scheduleStepSchema = z.strictObject({ startAt: utcSchema, endAt: utcSchema }).refine(value => Date.parse(value.endAt) > Date.parse(value.startAt), { path: ["endAt"], message: "end_after_start" });
export const detailsStepSchema = z.discriminatedUnion("category", [
  z.strictObject({ category: z.literal("doctor"), visitReason: z.string().trim().max(240).optional() }),
  z.strictObject({ category: z.literal("lab"), testServiceIds: z.array(z.uuid()).min(1).max(30).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length), collection: z.enum(["home", "branch"]) }),
  z.strictObject({ category: z.literal("ambulance"), mode: z.literal("scheduled"), destinationAddressId: z.uuid(), passengers: z.number().int().min(1).max(4) }),
  z.strictObject({ category: z.literal("caretaker"), scope: z.literal("nonclinical"), tasks: z.array(z.enum(["companionship", "mobility_assistance", "daily_living_assistance"])).min(1).max(3), units: z.number().int().min(1).max(24), unit: z.enum(["hour", "day"]) }),
]);
export const paymentPolicyStepSchema = z.strictObject({ method: z.enum(["pay_after", "online_test"]), priceSnapshot: priceSnapshotSchema,
  approvedPolicyVersionId: z.uuid(), accepted: z.literal(true), noticeVersion: z.string().min(1) })
  .refine(value => value.approvedPolicyVersionId === value.priceSnapshot.policyVersionId, { path: ["approvedPolicyVersionId"], message: "policy_mismatch" });
export const reviewStepSchema = z.strictObject({ service: serviceStepSchema, patient: patientStepSchema, location: locationStepSchema, schedule: scheduleStepSchema,
  details: detailsStepSchema, paymentPolicy: paymentPolicyStepSchema, confirmed: z.literal(true), eligibilityVersion: versionSchema })
  .refine(value => value.service.category === value.details.category, { path: ["details"], message: "category_mismatch" });
/** Result is read from a validated server response, never fabricated by wizard navigation. */
export const resultStepSchema = bookingSchema.pick({ id: true, publicReference: true, version: true, synthetic: true }).extend({ status: bookingStatusSchema });
export const bookingWizardSteps = { service: serviceStepSchema, patient: patientStepSchema, location: locationStepSchema, schedule: scheduleStepSchema,
  details: detailsStepSchema, paymentPolicy: paymentPolicyStepSchema, review: reviewStepSchema, result: resultStepSchema } as const;
export type BookingReview = z.infer<typeof reviewStepSchema>;
