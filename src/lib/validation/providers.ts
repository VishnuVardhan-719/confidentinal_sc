import { z } from "zod";

export const providerIdSchema = z.uuid();
export const versionSchema = z.strictObject({ expectedVersion: z.number().int().positive().max(2_147_483_646) });
const profileFields = {
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
};
export const providerCreateSchema = z.strictObject({
  ...profileFields,
  category: z.enum(["doctor", "lab", "ambulance", "caretaker"]),
  organizationId: z.uuid().optional(),
});
export const providerPatchSchema = z.strictObject({ ...profileFields, ...versionSchema.shape });
export const documentSchema = z.strictObject({
  kind: z.enum(["identity", "registration", "licence", "vehicle_permit", "background_check"]),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  expiresAt: z.iso.datetime({ offset: true }),
  ...versionSchema.shape,
});
export const reviewSchema = z.strictObject({
  decision: z.enum(["under_review", "approved", "rejected", "suspended"]),
  reason: z.string().trim().min(1).max(1000),
  ...versionSchema.shape,
});
