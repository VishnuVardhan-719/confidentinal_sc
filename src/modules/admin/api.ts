import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type { AdminCapability, AdminScope } from "./capabilities";
import type {
  AdminInvite,
  AdminInviteInput,
  AdminSettingsView,
  AdminUserSummary,
  BookingOpsRecord,
  CoverageArea,
  CoverageChange,
  CoverageDecisionInput,
  CoverageFilter,
  Page,
  PaymentRecordView,
  ProviderReviewDetail,
  ProviderReviewFilter,
  ProviderReviewInput,
  ProviderReviewQueueItem,
  RefundView,
  SupportTicketView,
} from "./types";

/**
 * Typed admin module API. Capability-based; the server checks scope on every
 * call. Areas without a documented endpoint return `gated` in the http adapter.
 */
export interface AdminApi {
  readonly mode: AdapterMode;
  // Provider review
  listProviderReviews(filter?: ProviderReviewFilter): Promise<ApiResult<Page<ProviderReviewQueueItem>>>;
  getProviderReview(providerId: string): Promise<ApiResult<ProviderReviewDetail>>;
  decideProviderReview(input: ProviderReviewInput): Promise<ApiResult<{ providerId: string; verificationState: string; version: number }>>;
  // Coverage
  listCoverage(filter?: CoverageFilter): Promise<ApiResult<Page<CoverageArea>>>;
  decideCoverage(input: CoverageDecisionInput): Promise<ApiResult<CoverageArea>>;
  listCoverageHistory(areaId: string): Promise<ApiResult<CoverageChange[]>>;
  // Booking operations (read-only)
  findBookingByReference(reference: string): Promise<ApiResult<BookingOpsRecord>>;
  listBookingExceptions(input?: { cursor?: string }): Promise<ApiResult<Page<BookingOpsRecord>>>;
  // Staff/admin access
  listAdmins(): Promise<ApiResult<AdminUserSummary[]>>;
  listAdminInvites(): Promise<ApiResult<AdminInvite[]>>;
  inviteAdmin(input: AdminInviteInput): Promise<ApiResult<AdminInvite>>;
  setAdminScope(input: { profileId: string; capabilities: AdminCapability[]; scope: AdminScope; idempotencyKey: string }): Promise<ApiResult<AdminUserSummary>>;
  suspendAdmin(input: { profileId: string; reason: string; idempotencyKey: string }): Promise<ApiResult<AdminUserSummary>>;
  // Payments / refunds (view models; live gated)
  listPayments(input?: { cursor?: string }): Promise<ApiResult<Page<PaymentRecordView>>>;
  listRefunds(input?: { cursor?: string }): Promise<ApiResult<Page<RefundView>>>;
  // Support queue
  listSupportQueue(input?: { cursor?: string }): Promise<ApiResult<Page<SupportTicketView>>>;
  // Settings (read-only)
  getSettings(): Promise<ApiResult<AdminSettingsView>>;
}
