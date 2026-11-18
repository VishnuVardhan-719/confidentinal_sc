import type { AuditEvent } from "@/modules/audit/types";
import { describeCategory, describeOutcome } from "@/modules/audit/status";
import type { Metric } from "./access";
import type { AdminCapability } from "./capabilities";
import {
  describeAdminStatus,
  describeGate,
  describeInvite,
  describePayment,
  describePriority,
  describeRefund,
  describeSupport,
  type StatusDescriptor,
} from "./status";
import type {
  AdminInvite,
  AdminSettingsView,
  AdminUserSummary,
  BookingOpsRecord,
  PaymentRecordView,
  RefundView,
  SupportTicketView,
} from "./types";

export const capabilityLabelKey = (c: AdminCapability): string => `admin.capability.${c.replace(":", ".")}`;

export type AdminQueueVM = {
  key: "providerReviews" | "coverageProposals" | "bookingExceptions" | "supportEscalations" | "refundRequests" | "deniedAuditEvents";
  labelKey: string;
  metric: Metric;
  href: string;
};

export type AdminDashboardVM = {
  /** Only queues the principal can act on. Empty array => "no admin areas assigned" empty state. */
  queues: AdminQueueVM[];
  /** True when every available queue has a real value of zero. */
  allClear: boolean;
};

export function toAdminDashboard(queues: AdminQueueVM[]): AdminDashboardVM {
  const allClear =
    queues.length > 0 && queues.every((q) => q.metric.kind === "value" && q.metric.value === 0 && !q.metric.lowerBound);
  return { queues, allClear };
}

export type BookingOpsVM = {
  reference: string;
  categoryKey: string;
  providerDisplayName: string;
  /** Raw booking state; render with the bookings module's canonical status map. */
  bookingState: BookingOpsRecord["bookingState"];
  /** Separate payment badge, never merged with booking state. */
  payment: StatusDescriptor;
  createdAt: string;
  scheduledStart: string | null;
  exceptions: { codeKey: string; raisedAt: string; open: boolean }[];
};

export const toBookingOps = (b: BookingOpsRecord): BookingOpsVM => ({
  reference: b.reference,
  categoryKey: `admin.category.${b.category}`,
  providerDisplayName: b.providerDisplayName,
  bookingState: b.bookingState,
  payment: describePayment(b.paymentStatus),
  createdAt: b.createdAt,
  scheduledStart: b.scheduledStart,
  exceptions: b.exceptions.map((e) => ({ codeKey: `admin.bookingException.${e.code}`, raisedAt: e.raisedAt, open: e.status === "open" })),
});

export type AdminUserRowVM = {
  profileId: string;
  displayName: string;
  status: StatusDescriptor;
  mfaEnrolled: boolean;
  grants: { labelKey: string; scopeKey: string; organizationId: string | null; expiresAt: string | null }[];
  /** False for the signed-in admin's own row: no self-granted or self-revoked access. */
  manageable: boolean;
};

export const toAdminUserRow = (u: AdminUserSummary, selfProfileId: string, canManage: boolean): AdminUserRowVM => ({
  profileId: u.profileId,
  displayName: u.displayName,
  status: describeAdminStatus(u.status),
  mfaEnrolled: u.mfaEnrolled,
  grants: u.grants.map((g) => ({
    labelKey: capabilityLabelKey(g.capability),
    scopeKey: g.scope.kind === "global" ? "admin.scope.global" : "admin.scope.organization",
    organizationId: g.scope.kind === "organization" ? g.scope.organizationId : null,
    expiresAt: g.expiresAt,
  })),
  manageable: canManage && u.profileId !== selfProfileId,
});

export type InviteRowVM = { id: string; maskedEmail: string; capabilityKeys: string[]; status: StatusDescriptor; invitedAt: string };

export const toInviteRow = (i: AdminInvite): InviteRowVM => ({
  id: i.id,
  maskedEmail: i.maskedEmail,
  capabilityKeys: i.capabilities.map(capabilityLabelKey),
  status: describeInvite(i.status),
  invitedAt: i.invitedAt,
});

export type PaymentRowVM = {
  bookingReference: string;
  status: StatusDescriptor;
  amountDuePaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  /** Pay-after collections are never labelled as gateway payments. */
  methodKey: string | null;
  isGateway: boolean;
  gatewayReference: string | null;
  reconciliationKey: string;
  testMode: boolean;
  updatedAt: string;
};

export const toPaymentRow = (p: PaymentRecordView): PaymentRowVM => ({
  bookingReference: p.bookingReference,
  status: describePayment(p.status),
  amountDuePaise: p.amountDuePaise,
  collectedPaise: p.collectedPaise,
  outstandingPaise: Math.max(0, p.amountDuePaise - p.collectedPaise),
  methodKey: p.method ? `admin.paymentMethod.${p.method}` : null,
  isGateway: p.method === "gateway",
  gatewayReference: p.method === "gateway" ? p.gatewayReference : null,
  reconciliationKey: `admin.reconciliation.${p.reconciliation}`,
  testMode: p.testMode,
  updatedAt: p.updatedAt,
});

export type RefundRowVM = {
  id: string;
  bookingReference: string;
  status: StatusDescriptor;
  requestedPaise: number;
  /** Only the server-approved amount; never a projected one. */
  approvedPaise: number | null;
  policyVersion: string;
  requestedAt: string;
};

export const toRefundRow = (r: RefundView): RefundRowVM => ({
  id: r.id,
  bookingReference: r.bookingReference,
  status: describeRefund(r.status),
  requestedPaise: r.requestedPaise,
  approvedPaise: r.approvedPaise,
  policyVersion: r.policyVersion,
  requestedAt: r.requestedAt,
});

export type SupportRowVM = {
  id: string;
  reference: string;
  status: StatusDescriptor;
  priority: StatusDescriptor;
  ownerKey: string;
  ownerName: string | null;
  bookingReference: string | null;
  createdAt: string;
  assignedAt: string | null;
  lastResponseAt: string | null;
};

export const toSupportRow = (t: SupportTicketView): SupportRowVM => ({
  id: t.id,
  reference: t.reference,
  status: describeSupport(t.status),
  priority: describePriority(t.priority),
  ownerKey: t.owner ? `admin.supportOwner.${t.owner.kind}` : "admin.supportOwner.unassigned",
  ownerName: t.owner?.displayName ?? null,
  bookingReference: t.bookingReference,
  createdAt: t.createdAt,
  assignedAt: t.assignedAt,
  lastResponseAt: t.lastResponseAt,
});

export type AuditRowVM = {
  id: string;
  occurredAt: string;
  actorKindKey: string;
  actorProfileId: string | null;
  action: string;
  category: StatusDescriptor;
  outcome: StatusDescriptor;
  target: string;
  reasonCode: string | null;
  reason: string | null;
  metadata: AuditEvent["metadata"];
};

export const toAuditRow = (e: AuditEvent): AuditRowVM => ({
  id: e.id,
  occurredAt: e.occurredAt,
  actorKindKey: `admin.audit.actor.${e.actor.kind}`,
  actorProfileId: e.actor.profileId,
  action: e.action,
  category: describeCategory(e.category),
  outcome: describeOutcome(e.outcome),
  target: `${e.target.type}:${e.target.id}`,
  reasonCode: e.reasonCode,
  reason: e.reason,
  metadata: e.metadata,
});

export type GateRowVM = { flag: string; labelKey: string; state: StatusDescriptor; editable: false };

export const toGateRows = (view: AdminSettingsView): GateRowVM[] =>
  view.gates.map((g) => ({ flag: g.flag, labelKey: g.labelKey, state: describeGate(g.enabled), editable: false }));
