import type { z } from "zod";
import { zodFields } from "@/modules/auth/http-client";

/**
 * Onboarding step model. Completion is derived ONLY from whether each saved section
 * satisfies its schema; there is no arbitrary percentage. `requiredForActivation`
 * is the frontend view of activation requirements; the server decides at submit.
 */
export type StepDefinition<Id extends string> = {
  id: Id;
  requiredForActivation: boolean;
  /** Message key in the `onboarding` namespace. */
  labelKey: string;
};

export type StepState = "not_started" | "incomplete" | "complete";

export type StepProgress<Id extends string> = {
  id: Id;
  requiredForActivation: boolean;
  state: StepState;
  /** field path -> stable code, for incomplete steps (e.g. { "items": "too_small" }). */
  issues: Record<string, string>;
};

export type OnboardingCompletion<Id extends string> = {
  steps: StepProgress<Id>[];
  requiredTotal: number;
  requiredComplete: number;
  missingRequired: Id[];
  readyToSubmit: boolean;
  /** First required step that is not complete, or null. */
  nextStep: Id | null;
};

/**
 * @param steps ordered step list (navigation order)
 * @param schemas section schema per data step; steps without a schema (e.g. provider review) are navigation-only
 * @param sections saved section values from the server draft
 */
export function computeCompletion<Id extends string>(
  steps: readonly StepDefinition<Id>[],
  schemas: Partial<Record<Id, z.ZodType>>,
  sections: Partial<Record<Id, unknown>>,
): OnboardingCompletion<Id> {
  const progress: StepProgress<Id>[] = [];
  for (const step of steps) {
    const schema = schemas[step.id];
    if (!schema) continue;
    const value = sections[step.id];
    if (value === undefined || value === null) {
      progress.push({ id: step.id, requiredForActivation: step.requiredForActivation, state: "not_started", issues: {} });
      continue;
    }
    const parsed = schema.safeParse(value);
    progress.push({
      id: step.id,
      requiredForActivation: step.requiredForActivation,
      state: parsed.success ? "complete" : "incomplete",
      issues: parsed.success ? {} : zodFields(parsed.error),
    });
  }
  const required = progress.filter((p) => p.requiredForActivation);
  const missingRequired = required.filter((p) => p.state !== "complete").map((p) => p.id);
  return {
    steps: progress,
    requiredTotal: required.length,
    requiredComplete: required.length - missingRequired.length,
    missingRequired,
    readyToSubmit: missingRequired.length === 0,
    nextStep: missingRequired[0] ?? null,
  };
}
