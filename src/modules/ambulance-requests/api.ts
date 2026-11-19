import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import type { ServiceRequestsApi } from "@/modules/service-requests/core";
import type { AmbulanceProvider, AmbulanceRequestDetails } from "./types";
import { createAmbulanceRequestsHttpApi } from "./http";
import { createAmbulanceRequestsFixtureApi } from "./fixture";

export type AmbulanceRequestsApi = ServiceRequestsApi<AmbulanceProvider, AmbulanceRequestDetails>;

/** Server-only factory. Fixture mode needs the patient API (members and addresses) of the same request. */
export function createAmbulanceRequestsApi(options: { env?: FixtureEnvironment; patient: PatientApi }): AmbulanceRequestsApi {
  return getAdapterMode(options.env) === "fixture" ? createAmbulanceRequestsFixtureApi(options) : createAmbulanceRequestsHttpApi();
}
