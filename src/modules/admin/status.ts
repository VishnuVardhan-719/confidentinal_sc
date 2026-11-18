import type { AdminPrincipalStatus } from "./capabilities";
import type { AdminInvite, CoverageStatus, PaymentStatus, RefundView, SupportTicketView, VerificationState } from "./types";

/**
 * Canonical admin label keys (namespace `admin`) and tones.
 * Unknown server values map to neutral "unknown", never to approved/active/paid.
 * Booking, payment and verification statuses are separate maps and badges.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "admin.status.unknown", tone: "neutral", known: false };

function describe<K extends string>(map: Readonly<Record<K, readonly [string, StatusTone]>>, raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(map, raw)) return UNKNOWN;
  const [labelKey, tone] = map[raw as K];
  return { labelKey, tone, known: true };
}

const VERIFICATION: Record<VerificationState, readonly [string, StatusTone]> = {
  draft: ["admin.status.verification.draft", "neutral"],
  submitted: ["admin.status.verification.submitted", "warning"],
  under_review: ["admin.status.verification.underReview", "info"],
  approved: ["admin.status.verification.approved", "success"],
  rejected: ["admin.status.verification.rejected", "danger"],
  suspended: ["admin.status.verification.suspended", "danger"],
};

const COVERAGE: Record<CoverageStatus, readonly [string, StatusTone]> = {
  proposed: ["admin.status.coverage.proposed", "warning"],
  approved: ["admin.status.coverage.approved", "success"],
  rejected: ["admin.status.coverage.rejected", "danger"],
  revoked: ["admin.status.coverage.revoked", "neutral"],
};

const PAYMENT: Record<PaymentStatus, readonly [string, StatusTone]> = {
  not_initiated: ["admin.status.payment.notInitiated", "neutral"],
  due: ["admin.status.payment.due", "warning"],
  processing: ["admin.status.payment.processing", "info"],
  paid: ["admin.status.payment.paid", "success"],
  partially_paid: ["admin.status.payment.partiallyPaid", "warning"],
  disputed: ["admin.status.payment.disputed", "danger"],
  refunded: ["admin.status.payment.refunded", "neutral"],
};

const REFUND: Record<RefundView["status"], readonly [string, StatusTone]> = {
  requested: ["admin.status.refund.requested", "warning"],
  approved: ["admin.status.refund.approved", "info"],
  rejected: ["admin.status.refund.rejected", "neutral"],
  processed: ["admin.status.refund.processed", "success"],
};

const SUPPORT: Record<SupportTicketView["status"], readonly [string, StatusTone]> = {
  open: ["admin.status.support.open", "warning"],
  provider_first_line: ["admin.status.support.providerFirstLine", "info"],
  escalated: ["admin.status.support.escalated", "danger"],
  resolved: ["admin.status.support.resolved", "success"],
  closed: ["admin.status.support.closed", "neutral"],
};

const PRIORITY: Record<SupportTicketView["priority"], readonly [string, StatusTone]> = {
  low: ["admin.priority.low", "neutral"],
  normal: ["admin.priority.normal", "info"],
  high: ["admin.priority.high", "warning"],
  safety: ["admin.priority.safety", "danger"],
};

const PRINCIPAL: Record<AdminPrincipalStatus, readonly [string, StatusTone]> = {
  invited: ["admin.status.admin.invited", "warning"],
  active: ["admin.status.admin.active", "success"],
  suspended: ["admin.status.admin.suspended", "danger"],
  revoked: ["admin.status.admin.revoked", "neutral"],
};

const INVITE: Record<AdminInvite["status"], readonly [string, StatusTone]> = {
  pending: ["admin.status.invite.pending", "warning"],
  accepted: ["admin.status.invite.accepted", "success"],
  expired: ["admin.status.invite.expired", "neutral"],
  revoked: ["admin.status.invite.revoked", "neutral"],
};

const GATE = {
  on: ["admin.settings.gateOn", "warning"],
  off: ["admin.settings.gateOff", "neutral"],
} as const satisfies Record<string, readonly [string, StatusTone]>;

export const describeVerification = (raw: unknown): StatusDescriptor => describe(VERIFICATION, raw);
export const describeCoverage = (raw: unknown): StatusDescriptor => describe(COVERAGE, raw);
export const describePayment = (raw: unknown): StatusDescriptor => describe(PAYMENT, raw);
export const describeRefund = (raw: unknown): StatusDescriptor => describe(REFUND, raw);
export const describeSupport = (raw: unknown): StatusDescriptor => describe(SUPPORT, raw);
export const describePriority = (raw: unknown): StatusDescriptor => describe(PRIORITY, raw);
export const describeAdminStatus = (raw: unknown): StatusDescriptor => describe(PRINCIPAL, raw);
export const describeInvite = (raw: unknown): StatusDescriptor => describe(INVITE, raw);
/** Only a literal boolean true reads as ON. */
export const describeGate = (enabled: unknown): StatusDescriptor => describe(GATE, enabled === true ? "on" : enabled === false ? "off" : undefined);
