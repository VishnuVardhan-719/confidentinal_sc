"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getReminderPrefsApi, type ReminderPrefs } from "@/modules/reminder-prefs";

/** Save reminder preferences with the expected version. Re-validated by the adapter; nothing is logged. */
export async function saveReminderPrefsAction(input: unknown, expectedVersion: number): Promise<ApiResult<ReminderPrefs>> {
  const session = getPatientSession();
  if (session.status !== "ok") return fail("unauthenticated");
  try {
    return await getReminderPrefsApi(process.env, session.fixtureActor).update(input, expectedVersion);
  } catch {
    return fail("unavailable");
  }
}
