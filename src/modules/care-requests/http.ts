import { createGatedServiceRequestsApi } from "@/modules/service-requests/fixture-engine";
import { careRequestInputSchema } from "./schemas";
import type { CareProvider, CareRequestDetails } from "./types";
import type { CareRequestsApi } from "./api";

/**
 * docs/API_CONTRACTS.md has no caretaker rate, care-scope or shift endpoints yet (docs/frontend/REQUESTS.md,
 * PHASE-R6-C). Validate the input, then fail closed with `gated`.
 */
export function createCareRequestsHttpApi(): CareRequestsApi {
  return createGatedServiceRequestsApi<CareProvider, CareRequestDetails>(careRequestInputSchema);
}
