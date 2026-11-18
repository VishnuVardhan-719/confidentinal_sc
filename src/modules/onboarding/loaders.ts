import { z } from "zod";
import type { ApiError, ApiResult } from "@/lib/api/result";
import { errorKey } from "@/modules/auth/errors";
import type { Locale, ProviderCategory } from "@/modules/auth/roles";
import type { Workspace } from "@/modules/auth/types";
import {
  canEditOnboarding,
  canSubmitForReview,
  presentProviderStatus,
  type ProviderStatusDisplay,
  type StatusPresentation,
} from "@/modules/verification/status";
import type { OnboardingApi } from "./api";
import { PATIENT_STEPS, patientCompletion, type PatientDraft, type PatientStepId } from "./patient";
import { PROVIDER_STEPS, providerCompletion, type ProviderOnboardingDraft } from "./provider";
import type { OnboardingCompletion, StepDefinition } from "./steps";
import { buildWizard, type WizardView } from "./wizard";

/**
 * Server loaders for onboarding pages. Take the request-bound API and the guard's
 * workspaces explicitly so they are unit-testable and never trust client input.
 * Every result is a discriminated union the page maps to normal/empty/error/gated states.
 */

export type LoadFailure =
  | { kind: "gated" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "error"; errorKey: string; code: ApiError["code"] };

const failure = (error: ApiError): LoadFailure => {
  if (error.code === "gated") return { kind: "gated" };
  if (error.code === "not_found") return { kind: "not_found" };
  if (error.code === "forbidden") return { kind: "forbidden" };
  return { kind: "error", errorKey: errorKey(error), code: error.code };
};

export const patientOnboardingBase = (locale: Locale) => `/${locale}/patient/onboarding`;
export const providerOnboardingBase = (locale: Locale, category: ProviderCategory) => `/${locale}/${category}/onboarding`;

/* ---------------- patient ---------------- */

export type PatientOnboardingView =
  | {
      kind: "ready";
      draft: PatientDraft;
      completion: OnboardingCompletion<PatientStepId>;
      wizard: WizardView<PatientStepId>;
    }
  | LoadFailure;

export async function loadPatientOnboarding(
  api: OnboardingApi,
  locale: Locale,
  requestedStep?: unknown,
): Promise<PatientOnboardingView> {
  const result = await api.getPatientDraft();
  if (!result.ok) return failure(result.error);
  const completion = patientCompletion(result.data.sections);
  return {
    kind: "ready",
    draft: result.data,
    completion,
    wizard: buildWizard(PATIENT_STEPS, completion, patientOnboardingBase(locale), requestedStep),
  };
}

/* ---------------- providers ---------------- */

export type SetupSummary = {
  status: ProviderStatusDisplay;
  presentation: StatusPresentation;
  /** Required steps still missing (activation requirements, not a percentage). */
  missingRequired: string[];
  requiredComplete: number;
  requiredTotal: number;
  canEdit: boolean;
  canSubmit: boolean;
};

export type ProviderOnboardingView =
  | { kind: "not_started"; category: ProviderCategory }
  | {
      kind: "ready";
      category: ProviderCategory;
      draft: ProviderOnboardingDraft;
      completion: OnboardingCompletion<string>;
      wizard: WizardView<string>;
      summary: SetupSummary;
    }
  | LoadFailure;

export function setupSummary(draft: ProviderOnboardingDraft, completion: OnboardingCompletion<string>): SetupSummary {
  const canEdit = canEditOnboarding(draft.status);
  return {
    status: draft.status,
    presentation: presentProviderStatus(draft.status),
    missingRequired: completion.missingRequired,
    requiredComplete: completion.requiredComplete,
    requiredTotal: completion.requiredTotal,
    canEdit,
    canSubmit: canEdit && canSubmitForReview(draft.status) && completion.readyToSubmit,
  };
}

/** The provider entity for this category, taken only from the server-derived workspaces. */
export const providerIdFor = (workspaces: readonly Workspace[], category: ProviderCategory): string | null =>
  workspaces.find((w) => w.role === category && w.providerId)?.providerId ?? null;

/**
 * @param requestedProviderId `?provider=` from the URL, used only when the session does not
 *   list the provider yet (just created; R-FE03-03). It is a lookup key, not an authority:
 *   the API authorizes the read and the category is checked below.
 */
export async function loadProviderOnboarding(
  api: OnboardingApi,
  category: ProviderCategory,
  workspaces: readonly Workspace[],
  locale: Locale,
  requestedStep?: unknown,
  requestedProviderId?: unknown,
): Promise<ProviderOnboardingView> {
  const requested = z.uuid().safeParse(requestedProviderId);
  const providerId = providerIdFor(workspaces, category) ?? (requested.success ? requested.data : null);
  if (!providerId) return { kind: "not_started", category };
  const result: ApiResult<ProviderOnboardingDraft> = await api.getProviderDraft(providerId);
  if (!result.ok) return failure(result.error);
  // Never render another category's draft under this route.
  if (result.data.category !== category) return { kind: "forbidden" };
  const completion = providerCompletion(category, result.data.sections as Partial<Record<string, unknown>>);
  const steps = PROVIDER_STEPS[category] as readonly StepDefinition<string>[];
  return {
    kind: "ready",
    category,
    draft: result.data,
    completion,
    wizard: buildWizard(steps, completion, providerOnboardingBase(locale, category), requestedStep),
    summary: setupSummary(result.data, completion),
  };
}
