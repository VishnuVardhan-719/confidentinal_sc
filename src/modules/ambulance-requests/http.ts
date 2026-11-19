import { createGatedServiceRequestsApi } from "@/modules/service-requests/fixture-engine";
import { ambulanceRequestInputSchema } from "./schemas";
import type { AmbulanceProvider, AmbulanceRequestDetails } from "./types";
import type { AmbulanceRequestsApi } from "./api";

/**
 * docs/API_CONTRACTS.md has no scheduled-transfer, fare or fleet endpoints yet (docs/frontend/REQUESTS.md,
 * PHASE-R6-C). Validate the input, then fail closed with `gated`. Emergency dispatch is a separate future module.
 */
export function createAmbulanceRequestsHttpApi(): AmbulanceRequestsApi {
  return createGatedServiceRequestsApi<AmbulanceProvider, AmbulanceRequestDetails>(ambulanceRequestInputSchema);
}
