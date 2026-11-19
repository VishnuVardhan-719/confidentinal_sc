import { fail } from "@/lib/api/result";
import type { ReminderPrefsApi } from "./api";

/** No reminder-preferences contract yet (docs/frontend/REQUESTS.md R-FE-P-R7-4). Fails closed; no network calls. */
export function createReminderPrefsHttpApi(): ReminderPrefsApi {
  return {
    get: async () => fail("gated"),
    update: async () => fail("gated"),
  };
}
