import type { Metric } from "@/modules/admin/access";
import {
  canRequestRecollection,
  collectionActionDenial,
  isTerminalSubstate,
  orderTotalsConsistent,
  reportReleaseDenial,
  reportReviewDenial,
  type ReportDenial,
} from "./rules";
import {
  describeActive,
  describeCredential,
  describeLabOrder,
  describeMembership,
  describeReport,
  type StatusDescriptor,
} from "./status";
import type {
  LabActor,
  LabBranch,
  LabCatalogItem,
  LabCollectionAction,
  LabOrder,
  LabReport,
  LabStaffMember,
} from "./types";

/**
 * Narrow view models for lab screens. Money stays integer paise and times stay
 * UTC ISO; the UI formats them (INR, Asia/Kolkata) with the shared formatters.
 */

export type LabDashboardVM = {
  roles: LabActor["roles"];
  manager: {
    today: Metric;
    pending: Metric;
    processing: Metric;
    exceptions: Metric;
    branches: BranchRowVM[] | null;
  } | null;
  collector: { assigned: Metric } | null;
  reviewer: { awaitingReview: Metric; awaitingRelease: Metric } | null;
};

export type BranchRowVM = {
  id: string;
  name: string;
  locality: string;
  city: string;
  pin: string;
  homeCollectionPins: string[];
  verification: StatusDescriptor;
  active: StatusDescriptor;
  /** Activation is offered only for a verified branch; the server decides. */
  canToggleActive: boolean;
  version: number;
};

export const toBranchRow = (b: LabBranch): BranchRowVM => ({
  id: b.id,
  name: b.name,
  locality: b.locality,
  city: b.city,
  pin: b.pin,
  homeCollectionPins: b.homeCollectionPins,
  verification: describeCredential(b.verification),
  active: describeActive(b.active),
  canToggleActive: b.verification === "verified",
  version: b.version,
});

export type CatalogRowVM = {
  id: string;
  kind: LabCatalogItem["kind"];
  name: string;
  specimenKey: string;
  preparation: string;
  pricePaise: number;
  collectionTypeKey: string;
  /** Null unless the turnaround claim is approved for display (S01-Q05). */
  turnaroundHours: number | null;
  includedCount: number;
  active: StatusDescriptor;
  version: number;
};

export const toCatalogRow = (i: LabCatalogItem): CatalogRowVM => ({
  id: i.id,
  kind: i.kind,
  name: i.name,
  specimenKey: `lab.specimen.${i.specimen}`,
  preparation: i.preparation,
  pricePaise: i.pricePaise,
  collectionTypeKey: `lab.collectionType.${i.collectionType}`,
  turnaroundHours: i.turnaroundDisplayApproved ? i.turnaroundClaimHours : null,
  includedCount: i.includedItemIds.length,
  active: describeActive(i.active),
  version: i.version,
});

export type StaffRowVM = {
  membershipId: string;
  displayName: string;
  roleKeys: string[];
  membership: StatusDescriptor;
  credential: StatusDescriptor;
  branchNames: string[];
};

export const toStaffRow = (m: LabStaffMember, branches: readonly LabBranch[]): StaffRowVM => ({
  membershipId: m.membershipId,
  displayName: m.displayName,
  roleKeys: m.roles.map((r) => `lab.role.${r}`),
  membership: describeMembership(m.membershipStatus),
  credential: describeCredential(m.credentialStatus),
  branchNames: m.branchIds.map((id) => branches.find((b) => b.id === id)?.name).filter((n): n is string => n !== undefined),
});

export type OrderRowVM = {
  id: string;
  reference: string;
  windowStart: string;
  windowEnd: string;
  servicePin: string;
  status: StatusDescriptor;
  lineCount: number;
  totalPaise: number;
  /** False when server totals do not add up: show an error instead of a price. */
  totalsConsistent: boolean;
  collectorName: string | null;
};

export const toOrderRow = (o: LabOrder): OrderRowVM => ({
  id: o.id,
  reference: o.reference,
  windowStart: o.schedule.windowStart,
  windowEnd: o.schedule.windowEnd,
  servicePin: o.servicePin,
  status: describeLabOrder(o),
  lineCount: o.lines.length,
  totalPaise: o.totalPaise,
  totalsConsistent: orderTotalsConsistent(o),
  collectorName: o.assignedCollector?.displayName ?? null,
});

export type OrderDetailVM = OrderRowVM & {
  lines: LabOrder["lines"];
  priceSnapshotAt: string;
  policyVersion: string;
  failureReasonKey: string | null;
  history: { status: StatusDescriptor; at: string }[];
  canRequestRecollection: boolean;
  isRecollection: boolean;
  version: number;
};

const COLLECTION_KEYS: Readonly<Record<string, true>> = {
  scheduled: true,
  collecting: true,
  collected: true,
  processing_handoff: true,
  collection_failed: true,
  handoff_failed: true,
};
const isCollectionSubstate = (s: string): boolean => Object.prototype.hasOwnProperty.call(COLLECTION_KEYS, s);

export function toOrderDetail(o: LabOrder): OrderDetailVM {
  return {
    ...toOrderRow(o),
    lines: o.lines,
    priceSnapshotAt: o.priceSnapshotAt,
    policyVersion: o.policyVersion,
    failureReasonKey: o.failure ? `lab.failure.${o.failure.reason}` : null,
    history: o.history.map((h) => ({
      status: describeLabOrder({ substate: isCollectionSubstate(h.substate) ? h.substate : null, bookingState: h.substate }),
      at: h.at,
    })),
    canRequestRecollection: canRequestRecollection(o),
    isRecollection: o.recollectionOfOrderId !== null,
    version: o.version,
  };
}


export type CollectionJobVM = {
  orderId: string;
  reference: string;
  windowStart: string;
  windowEnd: string;
  servicePin: string;
  branchId: string;
  status: StatusDescriptor;
  /** Actions the assigned collector may take now. Failure actions need a reason code. */
  actions: { action: LabCollectionAction; needsReason: boolean; needsBranch: boolean }[];
  version: number;
};

const ACTIONS: readonly LabCollectionAction[] = [
  "start_collection",
  "mark_collected",
  "record_handoff",
  "record_collection_failed",
  "record_handoff_failed",
];

export function toCollectionJob(order: LabOrder, actor: LabActor): CollectionJobVM {
  const actions = isTerminalSubstate(order.substate)
    ? []
    : ACTIONS.filter((action) => {
        const denial = collectionActionDenial(actor, order, action, { reason: "technician_unable", branchId: order.branchId });
        return denial === null;
      }).map((action) => ({
        action,
        needsReason: action === "record_collection_failed" || action === "record_handoff_failed",
        needsBranch: action === "record_handoff",
      }));
  return {
    orderId: order.id,
    reference: order.reference,
    windowStart: order.schedule.windowStart,
    windowEnd: order.schedule.windowEnd,
    servicePin: order.servicePin,
    branchId: order.branchId,
    status: describeLabOrder(order),
    actions,
    version: order.version,
  };
}

export type ReportRowVM = {
  id: string;
  orderReference: string;
  fileVersion: number;
  status: StatusDescriptor;
  uploadedAt: string;
  reviewedAt: string | null;
  releasedAt: string | null;
  canReview: boolean;
  canRelease: boolean;
  /** Why release is not offered (message key), for an explanatory hint. */
  releaseBlockedKey: string | null;
  version: number;
};

const denialKey = (d: ReportDenial | null) => (d === null ? null : `lab.reports.blocked.${d}`);

export function toReportRow(report: LabReport, actor: LabActor, clinicalGateOn: boolean): ReportRowVM {
  const review = reportReviewDenial({ actor, report, clinicalGateOn });
  const release = reportReleaseDenial({ actor, report, clinicalGateOn });
  return {
    id: report.id,
    orderReference: report.orderReference,
    fileVersion: report.fileVersion,
    status: describeReport(report.state),
    uploadedAt: report.uploadedAt,
    reviewedAt: report.reviewedAt,
    releasedAt: report.releasedAt,
    canReview: review === null,
    canRelease: release === null,
    releaseBlockedKey: report.state === "released" ? null : denialKey(release),
    version: report.version,
  };
}
