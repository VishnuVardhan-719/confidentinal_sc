import { z } from "zod";
import { bookingMatchesReview } from "./review-matching";
import type { ApiErrorCode } from "@/lib/api/result";
import { bookingSchema, type Booking } from "./schemas";
import { bookingWizardSteps } from "./wizard";

export const WIZARD_STEPS = ["service", "patient", "location", "schedule", "details", "paymentPolicy", "review", "result"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export type EditableWizardStep = Exclude<WizardStep, "result">;
export type WizardValues = { [K in WizardStep]?: z.output<(typeof bookingWizardSteps)[K]> };
export type WizardIssue = { path: string; code: string };
export type WizardState = {
  phase: "editing" | "submitting" | "uncertain" | "review_required" | "result";
  step: WizardStep;
  values: WizardValues;
  revision: number;
  issues: WizardIssue[];
};
export type WizardEvent =
  | { type: "save"; step: EditableWizardStep; value: unknown }
  | { type: "next" } | { type: "back" } | { type: "go"; step: WizardStep }
  | { type: "submit_started" }
  | { type: "submit_uncertain"; revision: number }
  | { type: "submit_rejected"; revision: number; code: ApiErrorCode }
  | { type: "submit_resolved"; revision: number; booking: Booking };

export function createWizardState(): WizardState {
  return { phase: "editing", step: "service", values: {}, revision: 0, issues: [] };
}
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function beforeStep(values: WizardValues, step: WizardStep): WizardValues {
  const next = { ...values };
  for (const key of WIZARD_STEPS.slice(WIZARD_STEPS.indexOf(step))) delete next[key];
  return next;
}
function firstMissing(values: WizardValues): number {
  return WIZARD_STEPS.findIndex(step => values[step] === undefined);
}
/** Pure transient state only. Consumers must discard it on logout/workspace changes.
 * No browser storage, URL serialization, server authorization or offline POST queue. */
export function wizardReducer(state: WizardState, event: WizardEvent): WizardState {
  if (event.type === "submit_resolved" || event.type === "submit_uncertain" || event.type === "submit_rejected") {
    if (!["submitting", "uncertain"].includes(state.phase) || event.revision !== state.revision) return state;
    if (event.type === "submit_uncertain") return { ...state, phase: "uncertain", issues: [{ path: "review", code: "outcome_uncertain" }] };
    if (event.type === "submit_rejected") {
      if (state.phase === "uncertain") return state;
      if (event.code === "conflict") return { ...state, phase: "editing", step: "paymentPolicy", values: beforeStep(state.values, "paymentPolicy"), issues: [{ path: "paymentPolicy", code: "review_required" }] };
      return { ...state, phase: "editing", issues: [{ path: "review", code: event.code }] };
    }
    const parsed = bookingSchema.safeParse(event.booking);
    const review = state.values.review;
    if (!parsed.success || !review || parsed.data.providerId !== review.service.providerId || parsed.data.serviceId !== review.service.serviceId || parsed.data.category !== review.service.category) return state;
    const result = bookingWizardSteps.result.parse(parsed.data);
    if (!bookingMatchesReview(parsed.data, review)) return { ...state, phase: "review_required", values: { ...state.values, result }, issues: [{ path: "paymentPolicy", code: "review_required" }] };
    return { ...state, phase: "result", step: "result", values: { ...state.values, result }, issues: [] };
  }
  if (state.phase !== "editing") return state;
  if (event.type === "submit_started") {
    return state.step === "review" && state.values.review ? { ...state, phase: "submitting", issues: [] }
      : { ...state, issues: [{ path: "review", code: "review_required" }] };
  }
  if (event.type === "save") {
    const missing = firstMissing(state.values);
    if (WIZARD_STEPS.indexOf(event.step) > (missing === -1 ? 6 : missing)) return { ...state, issues: [{ path: event.step, code: "previous_step_required" }] };
    const parsed = bookingWizardSteps[event.step].safeParse(event.value);
    if (!parsed.success) return { ...state, values: beforeStep(state.values, event.step), revision: state.revision + 1,
      issues: parsed.error.issues.map(issue => ({ path: [event.step, ...issue.path].join("."), code: issue.code })) };
    if (event.step === "review") {
      const review = bookingWizardSteps.review.parse(parsed.data);
      if (WIZARD_STEPS.slice(0, 6).some(step => !same(state.values[step], review[step as keyof typeof review])))
        return { ...state, values: beforeStep(state.values, "review"), issues: [{ path: "review", code: "review_changed" }] };
    }
    if (same(state.values[event.step], parsed.data)) return { ...state, issues: [] };
    return { ...state, values: { ...beforeStep(state.values, event.step), [event.step]: parsed.data }, revision: state.revision + 1, issues: [] };
  }
  if (event.type === "back") {
    const index = Math.max(0, WIZARD_STEPS.indexOf(state.step) - 1);
    return { ...state, step: WIZARD_STEPS[index], issues: [] };
  }
  const target = event.type === "next" ? WIZARD_STEPS[WIZARD_STEPS.indexOf(state.step) + 1] : event.step;
  if (!target || target === "result") return { ...state, issues: [{ path: "review", code: "submit_required" }] };
  const missing = firstMissing(state.values);
  if (WIZARD_STEPS.indexOf(target) > (missing === -1 ? 6 : missing)) return { ...state, issues: [{ path: state.step, code: "step_required" }] };
  return { ...state, step: target, issues: [] };
}
