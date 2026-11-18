import type { ApiResult } from "@/lib/api/result";
import { errorKey, fieldMessageKeys } from "@/modules/auth/errors";
import type { OnboardingCompletion, StepDefinition, StepState } from "./steps";

/**
 * Wizard navigation and save-state machine shared by the patient and provider wizards.
 * The current step lives in the URL (`?step=<id>`; step IDs carry no personal data).
 * Drafts are server-saved only: nothing here touches localStorage/sessionStorage.
 */

export type WizardStepView<Id extends string> = {
  id: Id;
  labelKey: string;
  requiredForActivation: boolean;
  /** `navigation` = step without its own data (e.g. provider review). */
  state: StepState | "navigation";
  href: string;
  current: boolean;
};

export type WizardView<Id extends string> = {
  steps: WizardStepView<Id>[];
  current: Id;
  previous: Id | null;
  next: Id | null;
  /** Position for "Step n of m" text (1-based). */
  position: number;
  total: number;
  requiredComplete: number;
  requiredTotal: number;
  readyToSubmit: boolean;
};

export const stepHref = (basePath: string, step: string): string => `${basePath}?step=${encodeURIComponent(step)}`;

/**
 * Resolve the current step: a valid requested step wins; otherwise resume at the first
 * incomplete required step; otherwise the last step (review).
 */
export function resolveCurrentStep<Id extends string>(
  steps: readonly StepDefinition<Id>[],
  completion: OnboardingCompletion<Id>,
  requested: unknown,
): Id {
  const ids = steps.map((s) => s.id);
  if (typeof requested === "string" && (ids as string[]).includes(requested)) return requested as Id;
  return completion.nextStep ?? ids[ids.length - 1];
}

export function buildWizard<Id extends string>(
  steps: readonly StepDefinition<Id>[],
  completion: OnboardingCompletion<Id>,
  basePath: string,
  requested?: unknown,
): WizardView<Id> {
  const current = resolveCurrentStep(steps, completion, requested);
  const index = steps.findIndex((s) => s.id === current);
  const byId = new Map(completion.steps.map((p) => [p.id, p.state]));
  return {
    steps: steps.map((s) => ({
      id: s.id,
      labelKey: s.labelKey,
      requiredForActivation: s.requiredForActivation,
      state: byId.get(s.id) ?? "navigation",
      href: stepHref(basePath, s.id),
      current: s.id === current,
    })),
    current,
    previous: index > 0 ? steps[index - 1].id : null,
    next: index >= 0 && index < steps.length - 1 ? steps[index + 1].id : null,
    position: index + 1,
    total: steps.length,
    requiredComplete: completion.requiredComplete,
    requiredTotal: completion.requiredTotal,
    readyToSubmit: completion.readyToSubmit,
  };
}

/* ---------------- save state machine ---------------- */

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; version: number }
  /** `version` is set when earlier parts of a multi-section save succeeded (use it to retry). */
  | { status: "invalid"; errorKey: string; fieldErrors: Record<string, string>; version?: number }
  /** Draft changed elsewhere (another tab/device): reload before saving again. */
  | { status: "conflict"; errorKey: string }
  /** No backend contract yet; input stays on screen, nothing is persisted. */
  | { status: "gated"; errorKey: string }
  | { status: "error"; errorKey: string; retryAfterSeconds?: number }
  | { status: "redirect"; to: string };

export const SAVE_IDLE: SaveState = { status: "idle" };

/** Map a save result to the next UI state. `advanceTo` is where "Save and continue" goes. */
export function saveStateFrom<T extends { version: number }>(result: ApiResult<T>, advanceTo: string | null): SaveState {
  if (result.ok) return advanceTo ? { status: "redirect", to: advanceTo } : { status: "saved", version: result.data.version };
  const { error } = result;
  switch (error.code) {
    case "validation":
      return { status: "invalid", errorKey: "onboarding.errors.checkFields", fieldErrors: fieldMessageKeys(error.fields) };
    case "conflict":
      return { status: "conflict", errorKey: "onboarding.errors.draftConflict" };
    case "gated":
      return { status: "gated", errorKey: "onboarding.errors.saveUnavailable" };
    case "rate_limited":
      return error.retryAfterSeconds !== undefined
        ? { status: "error", errorKey: errorKey(error), retryAfterSeconds: error.retryAfterSeconds }
        : { status: "error", errorKey: errorKey(error) };
    default:
      return { status: "error", errorKey: errorKey(error) };
  }
}
