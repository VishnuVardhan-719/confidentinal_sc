import type { ApiError } from "@/lib/api/result";
import { errorKey, fieldMessageKeys } from "@/modules/auth/errors";
import { formChecked, formInt, formString, formTrimmed } from "@/modules/auth/form-data";
import type { VerificationApi } from "./api";
import {
  allowedCoverageDecisions,
  parseCoverageFilter,
  parseReviewQueueFilter,
  type CoverageArea,
  type CoverageFilter,
  type ReviewQueueFilter,
} from "./queries";
import {
  allowedDecisions,
  canStartReview,
  type ProviderReviewDetail,
  type ReviewDecision,
  type ReviewQueueItem,
} from "./schemas";

/**
 * Admin verification loaders and mutation cores. Capability/MFA/self-approval checks are
 * server-side (I02); the explicit confirmation checkbox here is a UX safeguard only.
 */

export type AdminLoad<T> =
  | { kind: "ready"; data: T }
  | { kind: "gated" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "error"; errorKey: string };

const loadFailure = (error: ApiError): AdminLoad<never> => {
  if (error.code === "gated") return { kind: "gated" };
  if (error.code === "not_found") return { kind: "not_found" };
  if (error.code === "forbidden" || error.code === "unauthenticated") return { kind: "forbidden" };
  return { kind: "error", errorKey: errorKey(error) };
};

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

export async function loadReviewQueue(
  api: VerificationApi,
  searchParams: SearchParamsLike,
): Promise<{ filter: ReviewQueueFilter; result: AdminLoad<ReviewQueueItem[]> }> {
  const filter = parseReviewQueueFilter(searchParams);
  const r = await api.listReviewQueue(filter);
  return { filter, result: r.ok ? { kind: "ready", data: r.data } : loadFailure(r.error) };
}

export type ReviewDetailView = {
  detail: ProviderReviewDetail;
  decisions: readonly ReviewDecision[];
  canStartReview: boolean;
};

export async function loadReviewDetail(api: VerificationApi, providerId: string): Promise<AdminLoad<ReviewDetailView>> {
  const r = await api.getProviderForReview(providerId);
  if (!r.ok) return loadFailure(r.error);
  return {
    kind: "ready",
    data: { detail: r.data, decisions: allowedDecisions(r.data.status), canStartReview: canStartReview(r.data.status) },
  };
}

export async function loadCoverage(
  api: VerificationApi,
  searchParams: SearchParamsLike,
): Promise<{ filter: CoverageFilter; result: AdminLoad<Array<CoverageArea & { decisions: readonly string[] }>> }> {
  const filter = parseCoverageFilter(searchParams);
  const r = await api.listCoverage(filter);
  if (!r.ok) return { filter, result: loadFailure(r.error) };
  return { filter, result: { kind: "ready", data: r.data.map((a) => ({ ...a, decisions: allowedCoverageDecisions(a.state) })) } };
}

/* ---------------- mutations ---------------- */

export type DecisionState =
  | { status: "idle" }
  | { status: "invalid"; errorKey: string; fieldErrors: Record<string, string> }
  | { status: "conflict"; errorKey: string }
  | { status: "gated"; errorKey: string }
  | { status: "error"; errorKey: string }
  | { status: "done"; resultStatus: string; version: number };

export const DECISION_IDLE: DecisionState = { status: "idle" };

const decisionFailure = (error: ApiError): DecisionState => {
  switch (error.code) {
    case "validation":
      return { status: "invalid", errorKey: "onboarding.adminReview.errors.checkFields", fieldErrors: fieldMessageKeys(error.fields) };
    case "conflict":
      return { status: "conflict", errorKey: "onboarding.adminReview.errors.staleVersion" };
    case "gated":
      return { status: "gated", errorKey: "onboarding.adminReview.errors.unavailable" };
    default:
      return { status: "error", errorKey: errorKey(error) };
  }
};

const needsConfirmation = (fd: FormData): DecisionState | null =>
  formChecked(fd, "confirm")
    ? null
    : { status: "invalid", errorKey: "onboarding.adminReview.errors.confirmRequired", fieldErrors: { confirm: "errors.fields.confirm_required" } };

/** Form fields: providerId, decision, reason, expectedVersion, confirm. */
export async function runReviewDecision(api: VerificationApi, fd: FormData): Promise<DecisionState> {
  const unconfirmed = needsConfirmation(fd);
  if (unconfirmed) return unconfirmed;
  const providerId = formString(fd, "providerId", 64) ?? "";
  const r = await api.submitDecision(providerId, {
    decision: formString(fd, "decision", 32) as ReviewDecision,
    reason: formTrimmed(fd, "reason", 1000) ?? "",
    expectedVersion: formInt(fd, "expectedVersion") ?? 0,
  });
  return r.ok ? { status: "done", resultStatus: r.data.status, version: r.data.version } : decisionFailure(r.error);
}

export async function runStartReview(api: VerificationApi, fd: FormData): Promise<DecisionState> {
  const providerId = formString(fd, "providerId", 64) ?? "";
  const r = await api.startReview(providerId, {
    reason: formTrimmed(fd, "reason", 1000) ?? "",
    expectedVersion: formInt(fd, "expectedVersion") ?? 0,
  });
  return r.ok ? { status: "done", resultStatus: r.data.status, version: r.data.version } : decisionFailure(r.error);
}

/** Form fields: areaId, decision, reason, expectedVersion, confirm. */
export async function runCoverageDecision(api: VerificationApi, fd: FormData): Promise<DecisionState> {
  const unconfirmed = needsConfirmation(fd);
  if (unconfirmed) return unconfirmed;
  const r = await api.decideCoverage({
    areaId: formString(fd, "areaId", 64) ?? "",
    decision: formString(fd, "decision", 16) as "approve",
    reason: formTrimmed(fd, "reason", 1000) ?? "",
    expectedVersion: formInt(fd, "expectedVersion") ?? 0,
  });
  return r.ok ? { status: "done", resultStatus: r.data.state, version: r.data.version } : decisionFailure(r.error);
}
