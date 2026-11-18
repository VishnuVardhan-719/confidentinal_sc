import { describeStatus, type StatusDescriptor } from "@/modules/clinical/status-core";
import type { FactBadge } from "./logic";
import type { CollectionMethod, CollectionStatus, PhotoConsentDecision, PhotoScanStatus, ProofState } from "./types";
import type { PdfLinkState } from "@/modules/clinical/pdf";

/** Pay-after collection badge. Separate from booking, clinical and gateway payment badges. */
export const COLLECTION_STATUS_MAP: Readonly<Record<CollectionStatus, StatusDescriptor>> = {
  not_recorded: { labelKey: "clinical.collection.status.notRecorded", tone: "neutral" },
  recorded: { labelKey: "clinical.collection.status.recorded", tone: "info" },
};

export const COLLECTION_METHOD_MAP: Readonly<Record<CollectionMethod, StatusDescriptor>> = {
  cash: { labelKey: "clinical.collection.method.cash", tone: "neutral" },
  upi_direct: { labelKey: "clinical.collection.method.upiDirect", tone: "neutral" },
};

export const FACT_BADGE_MAP: Readonly<Record<FactBadge, StatusDescriptor>> = {
  doctor_verified: { labelKey: "clinical.facts.badge.doctorVerified", tone: "success" },
  patient_entered: { labelKey: "clinical.facts.badge.patientEntered", tone: "neutral" },
  /** Server sent a verified flag without attribution/evidence: shown as needing review. */
  unverified_claim: { labelKey: "clinical.facts.badge.needsReview", tone: "warning" },
};

export const PROOF_STATE_MAP: Readonly<Record<ProofState, StatusDescriptor>> = {
  active: { labelKey: "clinical.proof.status.active", tone: "success" },
  expired: { labelKey: "clinical.proof.status.expired", tone: "neutral" },
  revoked: { labelKey: "clinical.proof.status.revoked", tone: "warning" },
};

export const PHOTO_CONSENT_MAP: Readonly<Record<PhotoConsentDecision, StatusDescriptor>> = {
  consent: { labelKey: "clinical.photo.consent.given", tone: "info" },
  decline: { labelKey: "clinical.photo.consent.declined", tone: "neutral" },
  withdrawn: { labelKey: "clinical.photo.consent.withdrawn", tone: "neutral" },
};

export const PHOTO_SCAN_MAP: Readonly<Record<PhotoScanStatus, StatusDescriptor>> = {
  pending: { labelKey: "clinical.photo.scan.pending", tone: "progress" },
  clean: { labelKey: "clinical.photo.scan.clean", tone: "success" },
  rejected: { labelKey: "clinical.photo.scan.rejected", tone: "danger" },
};

export const PDF_LINK_STATE_MAP: Readonly<Record<PdfLinkState["kind"], StatusDescriptor>> = {
  ready: { labelKey: "clinical.pdf.status.ready", tone: "success" },
  expired: { labelKey: "clinical.pdf.status.expired", tone: "warning" },
  version_mismatch: { labelKey: "clinical.pdf.status.versionMismatch", tone: "warning" },
};

export const describeCollectionStatus = (s: string | null | undefined) => describeStatus(COLLECTION_STATUS_MAP, s);
export const describeFactBadge = (s: string | null | undefined) => describeStatus(FACT_BADGE_MAP, s);
export const describeProofState = (s: string | null | undefined) => describeStatus(PROOF_STATE_MAP, s);
export const describePhotoConsent = (s: string | null | undefined) => describeStatus(PHOTO_CONSENT_MAP, s);
export const describePhotoScan = (s: string | null | undefined) => describeStatus(PHOTO_SCAN_MAP, s);
export const describePdfLinkState = (s: string | null | undefined) => describeStatus(PDF_LINK_STATE_MAP, s);
