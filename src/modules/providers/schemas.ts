import { z } from "zod";
import { categorySchema, paiseSchema, pinSchema, priceUnitSchema } from "@/modules/catalog/schemas";
export { categorySchema } from "@/modules/catalog/schemas";

/** Service-level directory entry. No private address, phone, documents or patient data. */
export const publicProviderSchema = z.object({
  id: z.uuid(), serviceId: z.uuid(), category: categorySchema,
  displayName: z.string().min(1), serviceTitle: z.string().min(1),
  durationMinutes: z.number().int().positive(), amountPaise: paiseSchema,
  currency: z.literal("INR"), unit: priceUnitSchema, termsVersion: z.string().min(1),
  pin: pinSchema, city: z.string(), availability: z.literal("advisory_only"),
  synthetic: z.boolean(),
});
export const providerPageSchema = z.object({ items: z.array(publicProviderSchema), nextCursor: z.string().nullable(), synthetic: z.boolean() });
export const providerDetailSchema = z.object({ items: z.array(publicProviderSchema), synthetic: z.boolean() });
export type PublicProvider = z.infer<typeof publicProviderSchema>;
export type ProviderPage = z.infer<typeof providerPageSchema>;
export type ProviderDetail = z.infer<typeof providerDetailSchema>;
