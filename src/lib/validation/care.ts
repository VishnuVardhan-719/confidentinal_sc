import { z } from "zod";
import { versionSchema } from "./booking";

// Closed nonclinical list; must equal care_private.valid_tasks in
// supabase/migrations/20261117001900_p5c_care_scope.sql (parity test in tests/unit/care.test.ts).
export const CARE_TASKS = ["companionship", "mobility_support", "personal_care_support", "meal_support", "light_household", "escort_walk"] as const;
// Must equal the care_plans.interruption_reason CHECK in 20261117001910_p5c_care_plans.sql.
export const CARE_INTERRUPT_REASONS = ["patient_request_end", "caregiver_unwell", "unsafe_environment", "ended_for_emergency", "other"] as const;
export const CARE_DECISIONS = ["confirmed", "disputed"] as const;

// expectedVersion 0 creates the first list; later saves send the current version.
export const careTasksSchema = z.strictObject({
  taskCodes: z.array(z.enum(CARE_TASKS)).min(1).max(6).refine(codes => new Set(codes).size === codes.length),
  expectedVersion: z.number().int().min(0).max(2_147_483_645),
});
export const careStepSchema = z.strictObject({ expectedVersion: versionSchema });
export const careInterruptSchema = z.strictObject({ expectedVersion: versionSchema, reason: z.enum(CARE_INTERRUPT_REASONS) });
// expectedVersion is the care plan version (get_care_plan plan_version), not the booking version.
export const careAttestSchema = z.strictObject({ expectedVersion: versionSchema, decision: z.enum(CARE_DECISIONS) });
