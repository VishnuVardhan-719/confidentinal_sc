import { createGatedServiceRequestsApi } from "@/modules/service-requests/fixture-engine";
import { labOrderInputSchema } from "./schemas";
import type { LabOrderDetails, LabProvider } from "./types";
import type { LabOrdersApi } from "./api";

/**
 * docs/API_CONTRACTS.md has no lab catalogue, multi-test order or collection-slot endpoints yet
 * (docs/frontend/REQUESTS.md, PHASE-R6-C). Validate the input, then fail closed with `gated`.
 */
export function createLabOrdersHttpApi(): LabOrdersApi {
  return createGatedServiceRequestsApi<LabProvider, LabOrderDetails>(labOrderInputSchema);
}
