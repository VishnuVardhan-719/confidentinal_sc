import { fail, type ApiResult } from "@/lib/api/result";
import type { CaretakerApi } from "./api";

/**
 * HTTP adapter for caretaker/agency.
 *
 * No caretaker endpoint is documented in docs/API_CONTRACTS.md. S01 proposes
 * `POST /api/bookings/:id/care/{start,end,interrupt}`; services, staff,
 * request queue, shifts, absence and replacement have no contract, and shift
 * series are deferred. Every method returns `gated` (REQUESTS.md).
 */
const gated = async (): Promise<ApiResult<never>> => fail("gated");

export function createCaretakerHttpApi(): CaretakerApi {
  return {
    mode: "http",
    listServices: gated,
    listStaff: gated,
    listRequests: gated,
    decideRequest: gated,
    listAssignments: gated,
    getAssignment: gated,
    performCareAction: gated,
    listShifts: gated,
    checkIn: gated,
    checkOut: gated,
    reportAbsence: gated,
    assignReplacement: gated,
    createRecurringPlan: gated,
  };
}
