import type { ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { CollectionRecord, PaymentSummary } from "./schemas";
import { createPaymentsHttpApi } from "./http";
import { createPaymentsFixtureApi } from "./fixture";
export interface PaymentsApi {
  getSummary(bookingId: string): Promise<ApiResult<PaymentSummary>>;
  recordCollection(input: CollectionRecord, idempotencyKey: string): Promise<ApiResult<{ version: number }>>;
}
export function createPaymentsApi(env?: FixtureEnvironment): PaymentsApi {
  return getAdapterMode(env) === "fixture" ? createPaymentsFixtureApi({ env }) : createPaymentsHttpApi();
}
