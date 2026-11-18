import type { ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { Notification } from "./schemas";
import { createNotificationsHttpApi } from "./http";
import { createNotificationsFixtureApi } from "./fixture";
export interface NotificationsApi {
  list(): Promise<ApiResult<{ items: Notification[] }>>;
  markRead(id: string, input: { expectedVersion: number }): Promise<ApiResult<Notification>>;
}
export function createNotificationsApi(env?: FixtureEnvironment): NotificationsApi {
  return getAdapterMode(env) === "fixture" ? createNotificationsFixtureApi({ env }) : createNotificationsHttpApi();
}
