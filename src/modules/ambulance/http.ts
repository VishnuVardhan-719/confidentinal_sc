import { fail, type ApiResult } from "@/lib/api/result";
import type { AmbulanceApi } from "./api";
import { getEmergencyGuidance } from "./emergency";

/**
 * HTTP adapter for scheduled ambulance transport.
 *
 * No ambulance endpoint is documented in docs/API_CONTRACTS.md. S01 proposes
 * `POST /api/bookings/:id/trip/{en-route,arrived,picked-up,destination-reached,interrupt}`;
 * fleet, crew, request queue and trip read endpoints are not specified.
 * Every method returns `gated` until contracts are agreed (REQUESTS.md).
 */
const gated = async (): Promise<ApiResult<never>> => fail("gated");

export function createAmbulanceHttpApi(env: Record<string, string | undefined> = process.env): AmbulanceApi {
  return {
    mode: "http",
    listFleet: gated,
    listCrew: gated,
    listRequests: gated,
    getRequest: gated,
    listTrips: gated,
    getTrip: gated,
    getDriverQueue: gated,
    getDriverTrip: gated,
    performTripAction: gated,
    getEmergencyGuidance: () => getEmergencyGuidance(env),
  };
}
