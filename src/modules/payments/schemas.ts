import { z } from "zod";
import { paiseSchema, utcSchema, versionSchema } from "@/modules/catalog/schemas";
export const paymentStatusSchema = z.enum(["NOT_INITIATED", "DUE", "PROCESSING", "PAID", "PARTIALLY_PAID", "DISPUTED", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export const paymentSummarySchema = z.object({ bookingId: z.uuid(), status: paymentStatusSchema, currency: z.literal("INR"),
  amountDuePaise: paiseSchema, collectedPaise: paiseSchema, refundedPaise: paiseSchema, method: z.enum(["pay_after", "online_test"]).nullable(),
  version: versionSchema, synthetic: z.boolean() });
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;
/** A provider collection claim is not a gateway payment, tax invoice or receipt. */
export const collectionRecordSchema = z.strictObject({ bookingId: z.uuid(), amountPaise: paiseSchema.refine(value => value > 0),
  method: z.enum(["cash", "direct_upi"]), collectedAt: utcSchema, reference: z.string().trim().min(1).max(80).optional(), expectedVersion: versionSchema });
export type CollectionRecord = z.infer<typeof collectionRecordSchema>;
