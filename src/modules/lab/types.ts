/**
 * Lab view models. Narrow DTOs for screens, never raw DB rows.
 * Money is integer paise. Times are UTC ISO strings issued by the server.
 * Names follow S01 design (lab_orders / lab_order_items / lab_tests) where it exists.
 */

export type IsoUtc = string;

export type Page<T> = { items: T[]; nextCursor: string | null };

/** Shared booking states (B01 `bookings.state`). Owned by the bookings module; mirrored for typing only. */
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

export type CredentialStatus = "pending" | "verified" | "rejected" | "expired";

export type OperatingHours = { weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; opensAt: string; closesAt: string };

export type LabBranch = {
  id: string;
  name: string;
  locality: string;
  city: string;
  pin: string;
  operatingHours: OperatingHours[];
  /** Exact PINs approved for home collection (no radius matching). */
  homeCollectionPins: string[];
  verification: CredentialStatus;
  active: boolean;
  version: number;
};

export type SpecimenType = "blood" | "urine" | "stool" | "swab" | "other";
export type CollectionType = "home" | "branch";

export type LabCatalogItem = {
  id: string;
  kind: "test" | "package";
  branchId: string | null;
  name: string;
  specimen: SpecimenType;
  /** Approved preparation text (plain text), e.g. fasting instructions. */
  preparation: string;
  pricePaise: number;
  collectionType: CollectionType;
  /**
   * Turnaround the lab claims, in hours. S01-Q05: not shown to patients in core,
   * so `turnaroundDisplayApproved` is false until policy approves it.
   */
  turnaroundClaimHours: number | null;
  turnaroundDisplayApproved: boolean;
  /** For packages: included test item ids. */
  includedItemIds: string[];
  active: boolean;
  version: number;
};

export type LabStaffRole = "manager" | "collector" | "reviewer";
export type MembershipStatus = "invited" | "active" | "disabled";

export type LabStaffMember = {
  membershipId: string;
  profileId: string;
  /** Person resource id when the member can be assigned work. */
  resourceId: string | null;
  displayName: string;
  roles: LabStaffRole[];
  membershipStatus: MembershipStatus;
  branchIds: string[];
  credentialStatus: CredentialStatus;
};

/** S01 lab operational substates after acceptance. */
export type LabCollectionSubstate =
  | "scheduled"
  | "collecting"
  | "collected"
  | "processing_handoff"
  | "collection_failed"
  | "handoff_failed";

export type LabFailureReason =
  | "patient_unavailable"
  | "preparation_not_followed"
  | "address_not_found"
  | "sample_unusable"
  | "technician_unable";

export type LabOrderLine = {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};

export type LabOrder = {
  id: string;
  /** Server-issued reference, e.g. #SCV-BKG-000142. */
  reference: string;
  providerId: string;
  branchId: string;
  bookingState: BookingState;
  substate: LabCollectionSubstate | null;
  lines: LabOrderLine[];
  totalPaise: number;
  priceSnapshotAt: IsoUtc;
  policyVersion: string;
  schedule: { windowStart: IsoUtc; windowEnd: IsoUtc };
  /** Exact service PIN only. Street address is shown to the assigned collector in-window by the server. */
  servicePin: string;
  assignedCollector: { resourceId: string; displayName: string } | null;
  failure: { reason: LabFailureReason; recordedAt: IsoUtc } | null;
  /** Set when this order is a recollection; recollection is always a new booking. */
  recollectionOfOrderId: string | null;
  history: { substate: LabCollectionSubstate | BookingState; at: IsoUtc }[];
  version: number;
};

/** Collection actions available to the assigned collector (S01 commands). */
export type LabCollectionAction =
  | "start_collection"
  | "mark_collected"
  | "record_handoff"
  | "record_collection_failed"
  | "record_handoff_failed";

export type LabReportState = "uploaded" | "reviewed" | "released";

export type LabReport = {
  id: string;
  orderId: string;
  orderReference: string;
  providerId: string;
  /** Report file version; a new upload is a new version, not an edit. */
  fileVersion: number;
  state: LabReportState;
  uploadedByProfileId: string;
  uploadedAt: IsoUtc;
  reviewedByProfileId: string | null;
  reviewedAt: IsoUtc | null;
  releasedByProfileId: string | null;
  releasedAt: IsoUtc | null;
  version: number;
};

/** The signed-in lab staff member, as asserted by the server session. */
export type LabActor = {
  profileId: string;
  providerId: string;
  resourceId: string | null;
  membershipStatus: MembershipStatus;
  roles: readonly LabStaffRole[];
};

export type CollectionActionInput = {
  orderId: string;
  action: LabCollectionAction;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: LabFailureReason;
  /** Required for record_handoff; must equal the order branch. */
  branchId?: string;
};

export type ReportDecisionInput = { reportId: string; expectedVersion: number; idempotencyKey: string };
