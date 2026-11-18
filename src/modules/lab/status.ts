import type { CredentialStatus, LabCollectionSubstate, LabReportState, MembershipStatus } from "./types";

/**
 * Canonical lab status label keys (namespace `lab`) and tones.
 * Unknown server values map to a neutral "unknown" descriptor, never to an
 * active, released or verified one. Collection completion copy must never say
 * "report ready" (S01-Q08); that is enforced in the message files.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "lab.status.unknown", tone: "neutral", known: false };

function describe<K extends string>(map: Readonly<Record<K, readonly [string, StatusTone]>>, raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(map, raw)) return UNKNOWN;
  const [labelKey, tone] = map[raw as K];
  return { labelKey, tone, known: true };
}

const COLLECTION: Record<LabCollectionSubstate, readonly [string, StatusTone]> = {
  scheduled: ["lab.status.collection.scheduled", "info"],
  collecting: ["lab.status.collection.collecting", "info"],
  collected: ["lab.status.collection.collected", "info"],
  processing_handoff: ["lab.status.collection.processingHandoff", "success"],
  collection_failed: ["lab.status.collection.collectionFailed", "danger"],
  handoff_failed: ["lab.status.collection.handoffFailed", "danger"],
};

const REPORT: Record<LabReportState, readonly [string, StatusTone]> = {
  uploaded: ["lab.status.report.uploaded", "warning"],
  reviewed: ["lab.status.report.reviewed", "info"],
  released: ["lab.status.report.released", "success"],
};

const CREDENTIAL: Record<CredentialStatus, readonly [string, StatusTone]> = {
  pending: ["lab.status.credential.pending", "warning"],
  verified: ["lab.status.credential.verified", "success"],
  rejected: ["lab.status.credential.rejected", "danger"],
  expired: ["lab.status.credential.expired", "danger"],
};

const MEMBERSHIP: Record<MembershipStatus, readonly [string, StatusTone]> = {
  invited: ["lab.status.membership.invited", "warning"],
  active: ["lab.status.membership.active", "success"],
  disabled: ["lab.status.membership.disabled", "neutral"],
};

const CATALOG = {
  active: ["lab.status.catalog.active", "success"],
  inactive: ["lab.status.catalog.inactive", "neutral"],
} as const satisfies Record<string, readonly [string, StatusTone]>;

export const describeCollection = (raw: unknown): StatusDescriptor => describe(COLLECTION, raw);
export const describeReport = (raw: unknown): StatusDescriptor => describe(REPORT, raw);
export const describeCredential = (raw: unknown): StatusDescriptor => describe(CREDENTIAL, raw);
export const describeMembership = (raw: unknown): StatusDescriptor => describe(MEMBERSHIP, raw);
/** Catalog/branch active flag. Only a literal boolean true is active. */
export const describeActive = (active: unknown): StatusDescriptor =>
  describe(CATALOG, active === true ? "active" : active === false ? "inactive" : undefined);
