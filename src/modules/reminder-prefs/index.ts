import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureActor } from "@/fixtures/clinical/world";
import type { ReminderPrefsApi } from "./api";
import { createReminderPrefsFixtureApi } from "./fixture";
import { createReminderPrefsHttpApi } from "./http";

export type { ReminderPrefsApi } from "./api";
export * from "./types";
export * from "./schemas";
export * from "./status";

type Env = Record<string, string | undefined>;

/** Reminder preferences for the signed-in patient (synthetic store in fixture mode, gated over http). */
export function getReminderPrefsApi(env: Env = process.env, actor: FixtureActor | null = null): ReminderPrefsApi {
  if (getAdapterMode(env) !== "fixture") return createReminderPrefsHttpApi();
  return createReminderPrefsFixtureApi({ env, ownerId: actor?.role === "patient" ? actor.patientId : null });
}
