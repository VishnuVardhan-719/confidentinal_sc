import { z } from "zod";
import { containsMarkup, sanitizeText } from "@/modules/content/schema";
import type {
  LabActor,
  LabCollectionAction,
  LabCollectionSubstate,
  LabFailureReason,
  LabOrder,
  LabReport,
  LabReportState,
} from "./types";

/**
 * Pure lab rules mirroring S01. UI uses them to decide which actions to offer;
 * the server remains the authority and re-checks every command.
 */

const COLLECTION_TRANSITIONS: Record<LabCollectionAction, { from: readonly LabCollectionSubstate[]; to: LabCollectionSubstate }> = {
  start_collection: { from: ["scheduled"], to: "collecting" },
  mark_collected: { from: ["collecting"], to: "collected" },
  record_handoff: { from: ["collected"], to: "processing_handoff" },
  record_collection_failed: { from: ["scheduled", "collecting"], to: "collection_failed" },
  record_handoff_failed: { from: ["collected"], to: "handoff_failed" },
};

export const LAB_FAILURE_REASONS: readonly LabFailureReason[] = [
  "patient_unavailable",
  "preparation_not_followed",
  "address_not_found",
  "sample_unusable",
  "technician_unable",
];

const TERMINAL: readonly LabCollectionSubstate[] = ["processing_handoff", "collection_failed", "handoff_failed"];

export function isTerminalSubstate(substate: LabCollectionSubstate | null): boolean {
  return substate !== null && TERMINAL.includes(substate);
}

/** Next substate for an action, or null when the transition is not allowed. Terminal states never reset. */
export function nextCollectionSubstate(
  current: LabCollectionSubstate | null,
  action: LabCollectionAction,
): LabCollectionSubstate | null {
  if (current === null) return null;
  const rule = COLLECTION_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

export type CollectionDenial =
  | "membership_inactive"
  | "not_collector"
  | "not_assigned"
  | "wrong_provider"
  | "invalid_transition"
  | "reason_required"
  | "branch_mismatch";

/** Decides whether the actor may perform a collection action. Only the assigned collector may. */
export function collectionActionDenial(
  actor: LabActor,
  order: LabOrder,
  action: LabCollectionAction,
  extra: { reason?: LabFailureReason; branchId?: string } = {},
): CollectionDenial | null {
  if (actor.membershipStatus !== "active") return "membership_inactive";
  if (actor.providerId !== order.providerId) return "wrong_provider";
  if (!actor.roles.includes("collector")) return "not_collector";
  if (actor.resourceId === null || order.assignedCollector?.resourceId !== actor.resourceId) return "not_assigned";
  if (nextCollectionSubstate(order.substate, action) === null) return "invalid_transition";
  const isFailure = action === "record_collection_failed" || action === "record_handoff_failed";
  if (isFailure && (extra.reason === undefined || !LAB_FAILURE_REASONS.includes(extra.reason))) return "reason_required";
  if (action === "record_handoff" && extra.branchId !== order.branchId) return "branch_mismatch";
  return null;
}

/** Recollection is offered only after a failed collection and always creates a new booking. */
export function canRequestRecollection(order: LabOrder): boolean {
  return order.substate === "collection_failed" || order.substate === "handoff_failed";
}

/** Server-derived totals must add up; the UI flags a mismatch instead of recomputing a price. */
export function orderTotalsConsistent(order: LabOrder): boolean {
  const nonNegativeInt = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const linesOk = order.lines.every(
    (line) =>
      nonNegativeInt(line.unitPricePaise) &&
      nonNegativeInt(line.lineTotalPaise) &&
      Number.isSafeInteger(line.quantity) &&
      line.quantity > 0 &&
      line.lineTotalPaise === line.unitPricePaise * line.quantity,
  );
  const sum = order.lines.reduce((acc, line) => acc + line.lineTotalPaise, 0);
  return linesOk && nonNegativeInt(order.totalPaise) && sum === order.totalPaise;
}

// ---------------------------------------------------------------------------
// Reports: uploaded -> reviewed -> released. Release only by an authorized reviewer.
// Payment, upload or collection never release a report.
// ---------------------------------------------------------------------------

export type ReportDenial =
  | "gate_off"
  | "membership_inactive"
  | "wrong_provider"
  | "not_reviewer"
  | "self_review"
  | "invalid_state";

type ReportCheck = { actor: LabActor; report: LabReport; clinicalGateOn: boolean };

function baseReportDenial({ actor, report, clinicalGateOn }: ReportCheck): ReportDenial | null {
  if (!clinicalGateOn) return "gate_off";
  if (actor.membershipStatus !== "active") return "membership_inactive";
  if (actor.providerId !== report.providerId) return "wrong_provider";
  if (!actor.roles.includes("reviewer")) return "not_reviewer";
  return null;
}

/** Review: an active reviewer who did not upload this file version. */
export function reportReviewDenial(check: ReportCheck): ReportDenial | null {
  const base = baseReportDenial(check);
  if (base) return base;
  if (check.report.state !== "uploaded") return "invalid_state";
  if (check.report.uploadedByProfileId === check.actor.profileId) return "self_review";
  return null;
}

/** Release: an active reviewer, only after review. A collector-only member is always denied. */
export function reportReleaseDenial(check: ReportCheck): ReportDenial | null {
  const base = baseReportDenial(check);
  if (base) return base;
  if (check.report.state !== "reviewed") return "invalid_state";
  return null;
}

export type ReportEvent =
  | { type: "reviewed_by_reviewer"; actor: LabActor; at: string }
  | { type: "released_by_reviewer"; actor: LabActor; at: string }
  | { type: "payment_status_changed"; paymentStatus: string }
  | { type: "collection_completed" }
  | { type: "file_uploaded" };

/**
 * Applies an event to a report. Only reviewer events can move state; payment,
 * collection or upload events never change it.
 */
export function applyReportEvent(
  report: LabReport,
  event: ReportEvent,
  clinicalGateOn: boolean,
): { report: LabReport; denial: ReportDenial | null } {
  if (event.type === "reviewed_by_reviewer") {
    const denial = reportReviewDenial({ actor: event.actor, report, clinicalGateOn });
    if (denial) return { report, denial };
    return {
      report: { ...report, state: "reviewed", reviewedByProfileId: event.actor.profileId, reviewedAt: event.at, version: report.version + 1 },
      denial: null,
    };
  }
  if (event.type === "released_by_reviewer") {
    const denial = reportReleaseDenial({ actor: event.actor, report, clinicalGateOn });
    if (denial) return { report, denial };
    return {
      report: { ...report, state: "released", releasedByProfileId: event.actor.profileId, releasedAt: event.at, version: report.version + 1 },
      denial: null,
    };
  }
  return { report, denial: null };
}

export const REPORT_STATES: readonly LabReportState[] = ["uploaded", "reviewed", "released"];

// ---------------------------------------------------------------------------
// Catalog and branch edits (manager)
// ---------------------------------------------------------------------------

/** 1 crore rupees, in paise. Proposed ceiling matching C01's interim limit order of magnitude. */
export const MAX_CATALOG_PRICE_PAISE = 1_000_000_000;

export const catalogUpdateSchema = z.strictObject({
  pricePaise: z.number().int().min(0).max(MAX_CATALOG_PRICE_PAISE),
  preparation: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(1).max(500))
    .refine((v) => !containsMarkup(v), { message: "html_forbidden" }),
  active: z.boolean(),
});
export type CatalogUpdateInput = z.input<typeof catalogUpdateSchema>;

/** "450", "450.5", "450.50" rupees -> integer paise without floating point. Null when invalid. */
export function rupeesToPaise(text: string): number | null {
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paise <= MAX_CATALOG_PRICE_PAISE ? paise : null;
}

/** Activation needs a verified branch; deactivation is always allowed. */
export const branchToggleAllowed = (verification: string, nextActive: boolean): boolean => !nextActive || verification === "verified";
