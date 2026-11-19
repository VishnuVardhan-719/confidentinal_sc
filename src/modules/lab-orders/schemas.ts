import { z } from "zod";
import { baseRequestFields, serviceRequestSchema } from "@/modules/service-requests/core";

export const LAB_MAX_TESTS = 8;

/** What the patient sends. Prices come from the lab's catalogue on the server, never from this input. */
export const labOrderInputSchema = z.strictObject({
  ...baseRequestFields,
  testIds: z.array(z.uuid()).min(1).max(LAB_MAX_TESTS).refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length, { message: "duplicate" }),
  preparationAcknowledged: z.literal(true),
});
export type LabOrderInput = z.infer<typeof labOrderInputSchema>;

export const labOrderDetailsSchema = z.object({
  collection: z.literal("home"),
  tests: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(120), specimen: z.enum(["blood", "urine"]), preparation: z.enum(["fasting_10h", "morning_sample", "none"]) })).min(1),
});
export const labOrderSchema = serviceRequestSchema(labOrderDetailsSchema);
