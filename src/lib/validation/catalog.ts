import { z } from "zod";

export const pinSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/);
// Interim ceiling authorized for C01. Zero remains pending owner policy.
export const paiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(value => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BigInt("10000000000"));
export const categorySchema = z.enum(["doctor", "lab", "ambulance", "caretaker"]);
export const providerReferenceSchema = z.string().regex(/^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$/);
export const cursorSchema = z.string().max(120).regex(/^[0-9]+,SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19},[0-9a-f-]+$/i)
  .transform(value => value.split(","))
  .pipe(z.tuple([paiseSchema, providerReferenceSchema, z.uuid()]));
export const queueCursorSchema = z.string().max(120).transform(value => value.split(","))
  .pipe(z.tuple([z.enum(["0", "1"]), z.iso.datetime({ offset: true }), z.uuid()]));
export const searchSchema = z.strictObject({
  category: categorySchema, pin: pinSchema, priceMax: paiseSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20), cursor: cursorSchema.optional(),
});
export const serviceSchema = z.strictObject({
  providerId: z.uuid(), catalogTypeId: z.uuid(), title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(""),
  durationMinutes: z.number().int().positive().max(10080),
  status: z.enum(["draft", "published", "archived"]),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
});
export const priceSchema = z.strictObject({ amountPaise: paiseSchema, termsVersion: z.string().trim().min(1).max(160),
  expectedVersion: z.number().int().positive().max(2_147_483_646) });
export const coverageSchema = z.strictObject({ providerId: z.uuid(), pin: pinSchema,
  expectedVersion: z.number().int().positive().max(2_147_483_646) });
const approvalExpirySchema = z.iso.datetime({ offset: true }).refine(value => {
  const now = new Date();
  const max = new Date(now);
  const lastDay = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 0)).getUTCDate();
  max.setUTCFullYear(now.getUTCFullYear() + 1, now.getUTCMonth(), Math.min(now.getUTCDate(), lastDay));
  const expires = new Date(value).getTime();
  return expires > now.getTime() && expires <= max.getTime();
});
export const coverageReviewSchema = z.strictObject({ decision: z.enum(["approved", "rejected", "revoked"]),
  reason: z.string().trim().min(1).max(1000), expectedVersion: z.number().int().positive().max(2_147_483_646),
  validUntil: approvalExpirySchema.optional(),
}).refine(value => value.decision !== "approved" || value.validUntil !== undefined);
