import { fail, type ApiResult } from "@/lib/api/result";
import type { LabApi } from "./api";

/**
 * HTTP adapter for the lab module.
 *
 * No lab endpoint is documented in docs/API_CONTRACTS.md yet. S01 proposes
 * `POST /api/bookings/:id/lab/{start-collection,collected,handoff,collection-failed,handoff-failed}`
 * but nothing for branches, catalog, staff, order queues or reports (P2).
 * Until contracts are agreed every method returns the stable `gated` error
 * (logged in docs/frontend/REQUESTS.md). This never fabricates data.
 */
const gated = async (): Promise<ApiResult<never>> => fail("gated");

export function createLabHttpApi(): LabApi {
  return {
    mode: "http",
    listBranches: gated,
    listCatalog: gated,
    listStaff: gated,
    listOrders: gated,
    getOrder: gated,
    listAssignedCollections: gated,
    performCollectionAction: gated,
    requestRecollection: gated,
    listReports: gated,
    reviewReport: gated,
    releaseReport: gated,
  };
}
