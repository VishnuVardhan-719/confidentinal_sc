import type { ApiResult } from "@/lib/api/result";
import type { AmendmentRequest, SaveDraftRequest, SignRequest } from "./schemas";
import type { Consultation, DraftSnapshot, PdfLink, SaveDraftResponse, SignedConsultation } from "./types";

/**
 * Clinician-side consultation API (DC04-DC08, DC14). Gated behind FEATURE_CLINICAL.
 * Server must re-check assigned doctor, active visit and allowed status on every write.
 */
export type ClinicalApi = {
  /** Authoritative server draft (also used to recover after a conflict). */
  getDraft: (consultationId: string) => Promise<ApiResult<DraftSnapshot>>;
  /** Optimistic concurrency: rejected with "conflict" unless expectedVersion is current. */
  saveDraft: (consultationId: string, input: SaveDraftRequest) => Promise<ApiResult<SaveDraftResponse>>;
  /** Sign the confirmed draft version. Idempotency key is kept across retries of one intent. */
  finalize: (consultationId: string, input: SignRequest, idempotencyKey: string) => Promise<ApiResult<SignedConsultation>>;
  /** Append-only amendment of a signed record with mandatory reason. */
  amend: (consultationId: string, input: AmendmentRequest, idempotencyKey: string) => Promise<ApiResult<SignedConsultation>>;
  getConsultation: (consultationId: string) => Promise<ApiResult<Consultation>>;
  /** Short-lived link for the signed version only. Never available for drafts. */
  requestPdfLink: (consultationId: string) => Promise<ApiResult<PdfLink>>;
};
