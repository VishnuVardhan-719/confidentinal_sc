import { getAdapterMode } from "@/lib/api/mode";
import { createNotificationsApi, type NotificationsApi } from "@/modules/notifications/api";
import { createNotificationsFixtureApi } from "@/modules/notifications/fixture";

type Env = Record<string, string | undefined>;

/**
 * Notifications API for the patient inbox. In fixture mode FIXTURE_NOTIFICATION_SCENARIO=empty (a
 * SERVER env var, never user input) selects the empty inbox so that state can be reviewed. http mode
 * is unchanged (no inbox contract yet, so it fails closed as `gated`).
 */
export function patientNotificationsApi(env: Env = process.env): NotificationsApi {
  if (getAdapterMode(env) !== "fixture") return createNotificationsApi(env);
  return createNotificationsFixtureApi({ env, scenario: env.FIXTURE_NOTIFICATION_SCENARIO === "empty" ? "empty" : "unread" });
}
