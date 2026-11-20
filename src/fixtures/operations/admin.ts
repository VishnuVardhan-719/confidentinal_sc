import type { AdminGrant, AdminPrincipal } from "@/modules/admin/capabilities";
import type {
  AdminInvite,
  AdminUserSummary,
  BookingOpsRecord,
  CoverageArea,
  CoverageChange,
  PaymentRecordView,
  ProviderReviewDetail,
  RefundView,
  SupportTicketView,
} from "@/modules/admin/types";
import { SYNTHETIC_MARKER } from "./guard";

/** SYNTHETIC admin scenarios. Fictional providers, admins, references and amounts. */

const g = (capability: AdminGrant["capability"], scope: AdminGrant["scope"] = { kind: "global" }, expiresAt: string | null = null): AdminGrant => ({
  capability,
  scope,
  grantedAt: "2026-11-01T00:00:00Z",
  expiresAt,
  revokedAt: null,
});

export const adminPrincipals = {
  verifier: { profileId: "fx-adm-verifier", status: "active", mfaVerified: true, grants: [g("provider:verify"), g("coverage:verify")] },
  superAdmin: {
    profileId: "fx-adm-super",
    status: "active",
    mfaVerified: true,
    grants: [
      g("provider:verify"), g("coverage:verify"), g("security:audit"), g("membership:admin"), g("booking:operate"),
      g("payment:read"), g("support:operate"), g("settings:read"), g("content:edit"), g("content:publish"), g("review:moderate"),
    ],
  },
  /** Holds provider:verify but is also a manager of fx-prov-lab-2: must never approve it. */
  applicantAdmin: { profileId: "fx-prof-lab2-owner", status: "active", mfaVerified: true, grants: [g("provider:verify")] },
  noMfa: { profileId: "fx-adm-nomfa", status: "active", mfaVerified: false, grants: [g("provider:verify")] },
  suspended: { profileId: "fx-adm-suspended", status: "suspended", mfaVerified: true, grants: [g("provider:verify")] },
  noGrants: { profileId: "fx-adm-empty", status: "active", mfaVerified: true, grants: [] },
  contentEditor: { profileId: "fx-adm-editor", status: "active", mfaVerified: true, grants: [g("content:edit")] },
  contentPublisher: { profileId: "fx-adm-publisher", status: "active", mfaVerified: true, grants: [g("content:edit"), g("content:publish")] },
  orgAuditor: { profileId: "fx-adm-org-auditor", status: "active", mfaVerified: true, grants: [g("security:audit", { kind: "organization", organizationId: "fx-org-1" })] },
} satisfies Record<string, AdminPrincipal>;

const reviews: ProviderReviewDetail[] = [
  {
    providerId: "fx-prov-doc-1",
    category: "doctor",
    displayName: "Synthetic Doctor Practice",
    verificationState: "submitted",
    submittedAt: "2026-11-18T05:00:00Z",
    earliestDocumentExpiry: "2027-05-01T00:00:00Z",
    version: 3,
    organizationId: null,
    description: "Fictional home-visit practice for staging tests.",
    applicantProfileIds: ["fx-prof-doc-1"],
    documents: [
      { id: "fx-doc-1", kind: "identity", contentType: "image/jpeg", status: "pending", expiresAt: "2030-01-01T00:00:00Z", uploadedAt: "2026-11-18T04:50:00Z" },
      { id: "fx-doc-2", kind: "registration", contentType: "application/pdf", status: "pending", expiresAt: "2027-05-01T00:00:00Z", uploadedAt: "2026-11-18T04:55:00Z" },
    ],
    history: [],
  },
  {
    providerId: "fx-prov-lab-2",
    category: "lab",
    displayName: "Synthetic Lab Two",
    verificationState: "under_review",
    submittedAt: "2026-11-17T05:00:00Z",
    earliestDocumentExpiry: "2026-12-01T00:00:00Z",
    version: 4,
    organizationId: "fx-org-2",
    description: "Fictional laboratory organization.",
    applicantProfileIds: ["fx-prof-lab2-owner"],
    documents: [
      { id: "fx-doc-3", kind: "licence", contentType: "application/pdf", status: "pending", expiresAt: "2026-12-01T00:00:00Z", uploadedAt: "2026-11-17T04:00:00Z" },
    ],
    history: [{ decision: "under_review", reason: "Starting review.", reviewerProfileId: "fx-adm-verifier", at: "2026-11-17T08:00:00Z" }],
  },
  {
    providerId: "fx-prov-amb-1",
    category: "ambulance",
    displayName: "Synthetic Transport Operator",
    verificationState: "approved",
    submittedAt: "2026-11-10T05:00:00Z",
    earliestDocumentExpiry: "2026-11-25T00:00:00Z",
    version: 7,
    organizationId: "fx-org-1",
    description: "Fictional scheduled transport operator.",
    applicantProfileIds: ["fx-prof-amb-operator"],
    documents: [
      { id: "fx-doc-4", kind: "vehicle_permit", contentType: "application/pdf", status: "verified", expiresAt: "2026-11-25T00:00:00Z", uploadedAt: "2026-11-09T04:00:00Z" },
    ],
    history: [{ decision: "approved", reason: "Evidence verified.", reviewerProfileId: "fx-adm-verifier", at: "2026-11-11T08:00:00Z" }],
  },
];

const coverage: CoverageArea[] = [
  { areaId: "fx-area-1", providerId: "fx-prov-amb-1", category: "ambulance", providerDisplayName: "Synthetic Transport Operator", pin: "999901", city: "Sample City", status: "proposed", validFrom: null, validTo: null, version: 1, createdAt: "2026-11-18T06:00:00Z" },
  { areaId: "fx-area-2", providerId: "fx-prov-amb-1", category: "ambulance", providerDisplayName: "Synthetic Transport Operator", pin: "999902", city: "Sample City", status: "approved", validFrom: "2026-11-12T00:00:00Z", validTo: "2027-11-11T00:00:00Z", version: 2, createdAt: "2026-11-11T06:00:00Z" },
  { areaId: "fx-area-3", providerId: "fx-prov-lab-2", category: "lab", providerDisplayName: "Synthetic Lab Two", pin: "999903", city: "Sample City", status: "rejected", validFrom: null, validTo: null, version: 2, createdAt: "2026-11-17T06:00:00Z" },
];

const coverageHistory: CoverageChange[] = [
  { areaId: "fx-area-2", decision: "approved", reason: "PIN within verified operating base.", actorProfileId: "fx-adm-verifier", at: "2026-11-12T00:00:00Z" },
  { areaId: "fx-area-3", decision: "rejected", reason: "Provider not yet approved.", actorProfileId: "fx-adm-verifier", at: "2026-11-17T09:00:00Z" },
];

const bookings: BookingOpsRecord[] = [
  { bookingId: "fx-bkg-1", reference: "#SCV-BKG-900104", category: "lab", providerDisplayName: "Synthetic Lab One", bookingState: "completed", paymentStatus: "due", createdAt: "2026-11-16T09:00:00Z", scheduledStart: "2026-11-18T02:30:00Z", exceptions: [] },
  { bookingId: "fx-bkg-2", reference: "#SCV-BKG-900314", category: "ambulance", providerDisplayName: "Synthetic Transport Operator", bookingState: "interrupted", paymentStatus: "not_initiated", createdAt: "2026-11-17T09:00:00Z", scheduledStart: "2026-11-19T04:00:00Z", exceptions: [{ code: "trip_interrupted", raisedAt: "2026-11-19T04:30:00Z", status: "open" }] },
];

const admins: AdminUserSummary[] = [
  { profileId: "fx-adm-verifier", displayName: "Fixture Verifier", status: "active", mfaEnrolled: true, grants: [{ capability: "provider:verify", scope: { kind: "global" }, expiresAt: null }, { capability: "coverage:verify", scope: { kind: "global" }, expiresAt: null }] },
  { profileId: "fx-adm-super", displayName: "Fixture Admin Lead", status: "active", mfaEnrolled: true, grants: [{ capability: "membership:admin", scope: { kind: "global" }, expiresAt: null }] },
  { profileId: "fx-adm-suspended", displayName: "Fixture Former Admin", status: "suspended", mfaEnrolled: true, grants: [] },
];

const invites: AdminInvite[] = [
  { id: "fx-inv-1", maskedEmail: "s***@example.invalid", capabilities: ["support:operate"], scope: { kind: "global" }, status: "pending", invitedByProfileId: "fx-adm-super", invitedAt: "2026-11-18T10:00:00Z" },
];

const payments: PaymentRecordView[] = [
  { bookingReference: "#SCV-BKG-900104", status: "due", amountDuePaise: 55000, collectedPaise: 0, outstandingPaise: 55000, method: null, gatewayReference: null, reconciliation: "unreconciled", testMode: false, updatedAt: "2026-11-18T05:00:00Z" },
  { bookingReference: "#SCV-BKG-900313", status: "partially_paid", amountDuePaise: 116000, collectedPaise: 50000, outstandingPaise: 66000, method: "pay_after_cash", gatewayReference: null, reconciliation: "unreconciled", testMode: false, updatedAt: "2026-11-18T06:00:00Z" },
];

const refunds: RefundView[] = [
  { id: "fx-ref-1", bookingReference: "#SCV-BKG-900313", requestedPaise: 20000, approvedPaise: null, status: "requested", policyVersion: "fx-policy-v1", requestedAt: "2026-11-19T06:00:00Z" },
];

const support: SupportTicketView[] = [
  { id: "fx-tkt-1", reference: "#SCV-SUP-900001", priority: "normal", status: "provider_first_line", owner: { kind: "provider", displayName: "Synthetic Transport Operator" }, bookingReference: "#SCV-BKG-900314", createdAt: "2026-11-19T05:00:00Z", assignedAt: "2026-11-19T05:10:00Z", lastResponseAt: null },
  { id: "fx-tkt-2", reference: "#SCV-SUP-900002", priority: "safety", status: "escalated", owner: { kind: "platform", displayName: "Fixture Support Desk" }, bookingReference: null, createdAt: "2026-11-19T06:00:00Z", assignedAt: "2026-11-19T06:05:00Z", lastResponseAt: "2026-11-19T06:20:00Z" },
];

export const adminFixtures = { ...SYNTHETIC_MARKER, reviews, coverage, coverageHistory, bookings, admins, invites, payments, refunds, support };
