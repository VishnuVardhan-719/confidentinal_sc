"use server";

import { authorizeRole, getRequestApis } from "@/modules/auth/server";
import { formLocale } from "@/modules/auth/form-data";
import { runCoverageDecision, runReviewDecision, runStartReview, type DecisionState } from "./flows";

/**
 * Admin verification server actions. Each re-authorizes an ACTIVE admin workspace for
 * the target route before calling the API, which re-checks capability/MFA/self-approval.
 */

async function adminAllowed(fd: FormData, area: "providers" | "coverage"): Promise<boolean> {
  const locale = formLocale(fd);
  const outcome = await authorizeRole("admin", { locale, path: `/${locale}/admin/${area}` });
  return outcome.kind === "allowed";
}

const FORBIDDEN: DecisionState = { status: "error", errorKey: "errors.forbidden" };

export async function reviewDecisionAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  if (!(await adminAllowed(fd, "providers"))) return FORBIDDEN;
  const { verification } = await getRequestApis();
  return runReviewDecision(verification, fd);
}

export async function startReviewAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  if (!(await adminAllowed(fd, "providers"))) return FORBIDDEN;
  const { verification } = await getRequestApis();
  return runStartReview(verification, fd);
}

export async function coverageDecisionAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  if (!(await adminAllowed(fd, "coverage"))) return FORBIDDEN;
  const { verification } = await getRequestApis();
  return runCoverageDecision(verification, fd);
}
