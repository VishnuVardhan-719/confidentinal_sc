import { z } from "zod";
import { baseRequestFields, serviceRequestSchema } from "@/modules/service-requests/core";
import { CARE_TASKS } from "./types";

/** Hard limits for one shift; each provider sets a narrower range that the server also checks. */
export const CARE_MIN_HOURS = 1;
export const CARE_MAX_HOURS = 12;

/** What the patient sends. The hourly rate comes from the provider on the server, never from this input. */
export const careRequestInputSchema = z.strictObject({
  ...baseRequestFields,
  tasks: z.array(z.enum(CARE_TASKS)).min(1).max(CARE_TASKS.length).refine(tasks => new Set(tasks).size === tasks.length, { message: "duplicate" }),
  hours: z.number().int().min(CARE_MIN_HOURS).max(CARE_MAX_HOURS),
  scopeAcknowledged: z.literal(true),
});
export type CareRequestInput = z.infer<typeof careRequestInputSchema>;

export const careRequestDetailsSchema = z.object({
  kind: z.enum(["independent", "agency"]), tasks: z.array(z.enum(CARE_TASKS)).min(1), hours: z.number().int().min(CARE_MIN_HOURS).max(CARE_MAX_HOURS),
});
export const careRequestSchema = serviceRequestSchema(careRequestDetailsSchema);
