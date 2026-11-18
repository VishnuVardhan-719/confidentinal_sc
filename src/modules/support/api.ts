import type { ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { CreateTicket, SupportTicket } from "./schemas";
import { createSupportHttpApi } from "./http";
import { createSupportFixtureApi } from "./fixture";
export interface SupportApi {
  list(): Promise<ApiResult<{ items: SupportTicket[] }>>;
  get(id: string): Promise<ApiResult<SupportTicket>>;
  create(input: CreateTicket, idempotencyKey: string): Promise<ApiResult<SupportTicket>>;
}
export function createSupportApi(env?: FixtureEnvironment): SupportApi {
  return getAdapterMode(env) === "fixture" ? createSupportFixtureApi({ env }) : createSupportHttpApi();
}
