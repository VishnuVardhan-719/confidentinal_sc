import type { z } from "zod";
import { fieldErrors } from "@/components/ui/form-field";

export type StepDef = { id: string; title: string };

/** A step can be opened if it is the current one or any step up to the furthest one reached. */
export function canOpenStep(index: number, furthest: number, count: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < count && index <= furthest;
}

/** Validate one step's values. Returns field errors keyed by field name; empty when valid. */
export function stepErrors(schema: z.ZodType, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  return result.success ? {} : fieldErrors(result.error);
}
