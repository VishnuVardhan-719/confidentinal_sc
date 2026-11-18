import { z } from "zod";

export const categorySchema = z.enum(["doctor", "lab", "ambulance", "caretaker"]);
export type Category = z.infer<typeof categorySchema>;
export const pinSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/);
export const paiseSchema = z.number().int().min(0).max(10_000_000_000);
export const wirePaiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,10})$/).refine(value => Number(value) <= 10_000_000_000).transform(Number);
export const utcSchema = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const versionSchema = z.number().int().positive().max(2_147_483_645);
export const priceUnitSchema = z.enum(["visit", "test", "trip", "hour", "day"]);

/** Exact allowlisted public projection inspected on origin/task/C01-catalog. */
export const catalogRowSchema = z.object({
  provider_id: z.uuid(), category: categorySchema, display_name: z.string(),
  service_id: z.uuid(), service_title: z.string(), duration_minutes: z.number().int().positive(),
  amount_paise: wirePaiseSchema, currency: z.literal("INR"), unit: priceUnitSchema,
  terms_version: z.string().min(1), pin_code: pinSchema, city: z.string(), advisory_availability: z.null(),
});

export const catalogCursorSchema = z.string().max(120).refine(value => z.tuple([wirePaiseSchema, z.uuid(), z.uuid()]).safeParse(value.split(",")).success);
