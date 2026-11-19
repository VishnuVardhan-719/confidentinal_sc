import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import type { ServiceRequestsApi } from "@/modules/service-requests/core";
import type { CareProvider, CareRequestDetails } from "./types";
import { createCareRequestsHttpApi } from "./http";
import { createCareRequestsFixtureApi } from "./fixture";

export type CareRequestsApi = ServiceRequestsApi<CareProvider, CareRequestDetails>;

/** Server-only factory. Fixture mode needs the patient API (members and addresses) of the same request. */
export function createCareRequestsApi(options: { env?: FixtureEnvironment; patient: PatientApi }): CareRequestsApi {
  return getAdapterMode(options.env) === "fixture" ? createCareRequestsFixtureApi(options) : createCareRequestsHttpApi();
}
