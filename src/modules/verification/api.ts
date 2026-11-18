import type { ApiResult } from "@/lib/api/result";
import type {
  AdminReviewInput,
  ProviderReviewDetail,
  ReviewQueueItem,
  ReviewResult,
  SignedDocumentUrl,
  StartReviewInput,
} from "./schemas";
import type { CoverageArea, CoverageDecisionInput, CoverageFilter, ReviewQueueFilter } from "./queries";

/**
 * Admin provider verification API. Capability/MFA, self-approval prevention and audit
 * are enforced by the server (I02 `review_provider`); the UI only reflects decisions.
 */
export interface VerificationApi {
  /** Review queue. No list contract exists yet (HTTP adapter: gated). */
  listReviewQueue(filter?: ReviewQueueFilter): Promise<ApiResult<ReviewQueueItem[]>>;
  getProviderForReview(providerId: string): Promise<ApiResult<ProviderReviewDetail>>;
  startReview(providerId: string, input: StartReviewInput): Promise<ApiResult<ReviewResult>>;
  submitDecision(providerId: string, input: AdminReviewInput): Promise<ApiResult<ReviewResult>>;
  /** Short-lived signed URL; I02 keeps signing disabled, so HTTP returns gated. */
  requestDocumentUrl(providerId: string, documentId: string): Promise<ApiResult<SignedDocumentUrl>>;
  /** Coverage areas (PIN eligibility). No contract yet (HTTP adapter: gated). */
  listCoverage(filter?: CoverageFilter): Promise<ApiResult<CoverageArea[]>>;
  /** Approve/reject/revoke a coverage area with reason. No contract yet (HTTP adapter: gated). */
  decideCoverage(input: CoverageDecisionInput): Promise<ApiResult<CoverageArea>>;
}
