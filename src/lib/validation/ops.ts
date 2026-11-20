import { z } from "zod";
import { versionSchema } from "./booking";

// P5 shared engine §6.4: the database re-checks the outcome/reason pairing and the exception kind.
export const listExceptionsSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), after: z.uuid().optional() });
export const opsCloseSchema = z.strictObject({ expectedVersion: versionSchema, outcome: z.enum(["interrupted", "no_show"]),
  reason: z.enum(["no_show_confirmed", "ops_closeout", "provider_did_not_attend", "unsafe_conditions", "absence_disputed"]) });
export const opsResolveSchema = z.strictObject({ expectedVersion: versionSchema, resolution: z.literal("resolved") });
