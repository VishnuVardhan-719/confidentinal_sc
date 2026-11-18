import type { ApiResult } from "@/lib/api/result";
import type {
  AcceptInput,
  AcceptResource,
  AdvanceInput,
  ArrivalChallenge,
  AssignedVisitView,
  DeclineInput,
  DoctorRequestView,
  VerifyArrivalOutcome,
  VersionResponse,
} from "./types";

/**
 * Doctor module API. Both adapters (http, fixture) implement this.
 * Commands follow the B01 bookings contract: POST /api/bookings/:id/{accept,en-route,arrive,start}
 * with { expectedVersion } and a { version } response.
 */
export type DoctorApi = {
  /** Pending requests addressed to this doctor (minimal pre-accept fields). */
  listRequests: () => Promise<ApiResult<DoctorRequestView[]>>;
  /** Visits assigned to this doctor (post-accept fields). */
  listVisits: () => Promise<ApiResult<AssignedVisitView[]>>;
  /** Assigned-doctor-only visit detail. Other doctors get forbidden even with a known ID. */
  getVisit: (bookingId: string) => Promise<ApiResult<AssignedVisitView>>;
  /** Accept via the bookings contract (manual provider acceptance). */
  accept: (bookingId: string, input: AcceptInput) => Promise<ApiResult<VersionResponse>>;
  /** Decline via the bookings contract with a B01 reason. */
  decline: (bookingId: string, input: DeclineInput) => Promise<ApiResult<VersionResponse>>;
  /** Resources this doctor may attach when accepting (normally their own person resource). */
  listAcceptResources: () => Promise<ApiResult<AcceptResource[]>>;
  enRoute: (bookingId: string, input: AdvanceInput) => Promise<ApiResult<VersionResponse>>;
  /** Report arrival; the server starts a booking + doctor bound challenge. */
  arrive: (bookingId: string, input: AdvanceInput) => Promise<ApiResult<VersionResponse>>;
  getArrivalChallenge: (bookingId: string) => Promise<ApiResult<ArrivalChallenge>>;
  resendArrivalCode: (bookingId: string) => Promise<ApiResult<ArrivalChallenge>>;
  /** `code` is transient form input; adapters must not store or log it. */
  verifyArrival: (bookingId: string, input: { challengeId: string; code: string }) => Promise<ApiResult<VerifyArrivalOutcome>>;
  /** Separate explicit action after arrival verification. */
  startConsultation: (bookingId: string, input: AdvanceInput) => Promise<ApiResult<VersionResponse>>;
};
