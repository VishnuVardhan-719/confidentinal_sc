import type { FeatureFlag } from "@/lib/feature-flags";
import type { AdminCapability, AdminPrincipalStatus, AdminScope } from "./capabilities";

/**
 * Admin and organization-management view models (FE spec section 15).
 * Names follow I01/I02/C01 where they exist (`verification_state`,
 * `provider_documents`, `provider_service_areas`).
 */

export type IsoUtc = string;
export type Page<T> = { items: T[]; nextCursor: string | null };

export type ProviderCategory = "doctor" | "lab" | "ambulance" | "caretaker";

/** I02 `providers.verification_state`. */
export type VerificationState = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "suspended";

/** I02 review decisions accepted by `POST /api/admin/providers/:id/review`. */
export type ReviewDecision = "under_review" | "approved" | "rejected" | "suspended";

export type ProviderReviewFilter = {
  category?: ProviderCategory;
  state?: VerificationState;
  /** Only providers with any document expiring before this UTC instant. */
  expiringBefore?: IsoUtc;
  cursor?: string;
};

export type ProviderReviewQueueItem = {
  providerId: string;
  category: ProviderCategory;
  displayName: string;
  verificationState: VerificationState;
  submittedAt: IsoUtc | null;
  earliestDocumentExpiry: IsoUtc | null;
  version: number;
};

export type ProviderDocumentMeta = {
  id: string;
  kind: "identity" | "registration" | "licence" | "vehicle_permit" | "background_check";
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  status: "pending" | "verified" | "rejected" | "superseded";
  expiresAt: IsoUtc | null;
  uploadedAt: IsoUtc;
};

export type ReviewHistoryEntry = {
  decision: ReviewDecision;
  reason: string;
  reviewerProfileId: string;
  at: IsoUtc;
};

export type ProviderReviewDetail = ProviderReviewQueueItem & {
  organizationId: string | null;
  description: string;
  /** Profiles that own or manage the application, or uploaded its documents. Used for no-self-approval. */
  applicantProfileIds: string[];
  /** Metadata only. Files open through a separately authorized, short-lived signed URL. */
  documents: ProviderDocumentMeta[];
  history: ReviewHistoryEntry[];
};

export type ProviderReviewInput = {
  providerId: string;
  decision: ReviewDecision;
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
};

/** C01 `provider_service_areas.status`. */
export type CoverageStatus = "proposed" | "approved" | "rejected" | "revoked";
export type CoverageDecision = "approved" | "rejected" | "revoked";

export type CoverageArea = {
  areaId: string;
  providerId: string;
  category: ProviderCategory;
  providerDisplayName: string;
  pin: string;
  city: string | null;
  status: CoverageStatus;
  validFrom: IsoUtc | null;
  validTo: IsoUtc | null;
  version: number;
  createdAt: IsoUtc;
};

export type CoverageFilter = { status?: CoverageStatus; category?: ProviderCategory; pin?: string; cursor?: string };

export type CoverageChange = {
  areaId: string;
  decision: CoverageDecision;
  reason: string;
  actorProfileId: string;
  at: IsoUtc;
};

export type CoverageDecisionInput = {
  areaId: string;
  decision: CoverageDecision;
  reason: string;
  expectedVersion: number;
  /** Required when approving (C01). */
  validUntil?: IsoUtc;
  idempotencyKey: string;
};

export type BookingState =
  | "draft"
  | "requested"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled"
  | "no_show"
  | "interrupted";

export type PaymentStatus = "not_initiated" | "due" | "processing" | "paid" | "partially_paid" | "disputed" | "refunded";

export type BookingException = {
  code: "handoff_failed" | "eligibility_blocked" | "provider_no_show" | "trip_interrupted" | "care_interrupted" | "other";
  raisedAt: IsoUtc;
  status: "open" | "resolved";
};

/** Read-only operations record. No provider-impersonating or state-editing action exists. */
export type BookingOpsRecord = {
  bookingId: string;
  reference: string;
  category: ProviderCategory;
  providerDisplayName: string;
  bookingState: BookingState;
  /** Separate from booking state, never merged into one badge. */
  paymentStatus: PaymentStatus;
  createdAt: IsoUtc;
  scheduledStart: IsoUtc | null;
  exceptions: BookingException[];
};

export type AdminUserSummary = {
  profileId: string;
  displayName: string;
  status: AdminPrincipalStatus;
  mfaEnrolled: boolean;
  grants: { capability: AdminCapability; scope: AdminScope; expiresAt: IsoUtc | null }[];
};

export type AdminInvite = {
  id: string;
  /** Masked by the server, e.g. a***@example.invalid. */
  maskedEmail: string;
  capabilities: AdminCapability[];
  scope: AdminScope;
  status: "pending" | "accepted" | "expired" | "revoked";
  invitedByProfileId: string;
  invitedAt: IsoUtc;
};

export type AdminInviteInput = {
  email: string;
  capabilities: AdminCapability[];
  scope: AdminScope;
  idempotencyKey: string;
};

export type PaymentMethod = "gateway" | "pay_after_cash" | "pay_after_upi";

export type PaymentRecordView = {
  bookingReference: string;
  status: PaymentStatus;
  amountDuePaise: number;
  collectedPaise: number;
  /** Server-supplied outstanding amount. Never derived in the browser. */
  outstandingPaise: number;
  method: PaymentMethod | null;
  /** Gateway transaction reference, only when a verified capture exists. */
  gatewayReference: string | null;
  reconciliation: "unreconciled" | "reconciled" | "disputed";
  /** True only in a test-mode gateway environment; shown as a "test mode" marker. */
  testMode: boolean;
  updatedAt: IsoUtc;
};

export type RefundView = {
  id: string;
  bookingReference: string;
  requestedPaise: number;
  approvedPaise: number | null;
  status: "requested" | "approved" | "rejected" | "processed";
  policyVersion: string;
  requestedAt: IsoUtc;
};

export type SupportTicketView = {
  id: string;
  reference: string;
  priority: "low" | "normal" | "high" | "safety";
  status: "open" | "provider_first_line" | "escalated" | "resolved" | "closed";
  owner: { kind: "provider" | "platform"; displayName: string } | null;
  bookingReference: string | null;
  createdAt: IsoUtc;
  assignedAt: IsoUtc | null;
  lastResponseAt: IsoUtc | null;
};

export type GateSetting = {
  flag: FeatureFlag;
  enabled: boolean;
  /** Always false in the frontend: gates change only through the approved release process. */
  editable: false;
  labelKey: string;
};

export type AdminSettingsView = { gates: GateSetting[] };
