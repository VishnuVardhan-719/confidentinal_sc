import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { PatientApi } from "@/modules/patient/api";
import type { ServiceRequestsApi } from "@/modules/service-requests/core";
import type { LabOrderDetails, LabProvider } from "./types";
import { createLabOrdersHttpApi } from "./http";
import { createLabOrdersFixtureApi } from "./fixture";

export type LabOrdersApi = ServiceRequestsApi<LabProvider, LabOrderDetails>;

/** Server-only factory. Fixture mode needs the patient API (members and addresses) of the same request. */
export function createLabOrdersApi(options: { env?: FixtureEnvironment; patient: PatientApi }): LabOrdersApi {
  return getAdapterMode(options.env) === "fixture" ? createLabOrdersFixtureApi(options) : createLabOrdersHttpApi();
}
