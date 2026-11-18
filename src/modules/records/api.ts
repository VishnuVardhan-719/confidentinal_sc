import type { ApiResult } from "@/lib/api/result";
import type { PdfLink } from "@/modules/clinical/types";
import type {
  CollectionInput,
  CollectionView,
  ConfirmFactsInput,
  CorrectFactInput,
  HealthFactView,
  PatientRecordDetail,
  PatientRecordSummary,
  PhotoConsent,
  PhotoConsentInput,
  PhotoMeta,
  PhotoUploadInput,
  PrivateFileLink,
  ProofOfVisit,
  PublicProofView,
} from "./types";

/** DC09-DC14 records API. Clinical methods are gated behind FEATURE_CLINICAL (see index.ts). */
export type RecordsApi = {
  // DC09 patient views (signed records only)
  listMyRecords: () => Promise<ApiResult<PatientRecordSummary[]>>;
  getMyRecord: (consultationId: string) => Promise<ApiResult<PatientRecordDetail>>;
  // DC14 patient PDF (signed version only)
  requestMyRecordPdfLink: (consultationId: string) => Promise<ApiResult<PdfLink>>;
  // DC10 collection, independent of clinical finalization
  getCollection: (bookingId: string) => Promise<ApiResult<CollectionView>>;
  recordCollection: (bookingId: string, input: CollectionInput, idempotencyKey: string) => Promise<ApiResult<CollectionView>>;
  // DC11 health facts (assigned clinician for this booking)
  listHealthFacts: (bookingId: string) => Promise<ApiResult<HealthFactView[]>>;
  confirmHealthFacts: (bookingId: string, input: ConfirmFactsInput) => Promise<ApiResult<HealthFactView[]>>;
  /** Attributed correction; previous value preserved in history. */
  correctHealthFact: (bookingId: string, input: CorrectFactInput) => Promise<ApiResult<HealthFactView>>;
  // DC12 proof of visit
  issueProof: (bookingId: string, idempotencyKey: string) => Promise<ApiResult<ProofOfVisit>>;
  revokeProof: (bookingId: string, token: string) => Promise<ApiResult<ProofOfVisit>>;
  verifyProof: (token: string) => Promise<ApiResult<PublicProofView>>;
  // DC13 photo consent + private upload metadata
  getPhotoConsent: (consultationId: string) => Promise<ApiResult<PhotoConsent | null>>;
  recordPhotoConsent: (consultationId: string, input: PhotoConsentInput) => Promise<ApiResult<PhotoConsent>>;
  registerPhotoUpload: (consultationId: string, input: PhotoUploadInput) => Promise<ApiResult<PhotoMeta>>;
  listPhotos: (consultationId: string) => Promise<ApiResult<PhotoMeta[]>>;
  requestPhotoViewLink: (photoId: string) => Promise<ApiResult<PrivateFileLink>>;
};

/** Methods that stay available when the clinical flag is off (pay-after bookkeeping). */
export const UNGATED_RECORDS_METHODS = ["getCollection", "recordCollection"] as const satisfies readonly (keyof RecordsApi)[];
