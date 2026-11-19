import { getAdapterMode } from "@/lib/api/mode";
import { NO_ACTOR, type FixtureActor } from "@/fixtures/clinical/world";
import type { NotificationsApi } from "./patient-api";
import { createPatientNotificationsFixtureApi } from "./patient-fixture";
import { createPatientNotificationsHttpApi } from "./patient-http";

export type { NotificationsApi } from "./patient-api";
export * from "./types";

type Env = Record<string, string | undefined>;

/** Patient notifications. Fixture mode is synthetic and refused in production; http is "not connected". */
export function getNotificationsApi(env: Env = process.env, ctx: { fixtureActor?: FixtureActor } = {}): NotificationsApi {
  return getAdapterMode(env) === "fixture" ? createPatientNotificationsFixtureApi({ env, actor: ctx.fixtureActor ?? NO_ACTOR }) : createPatientNotificationsHttpApi();
}

export const unreadCount = (items: { readAt: string | null }[]): number => items.filter((n) => !n.readAt).length;
