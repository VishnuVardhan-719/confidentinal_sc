import type { ApiResult } from "@/lib/api/result";
import type { ReminderPrefs } from "./types";

/** Visit-reminder preferences. Updates carry the expected version; a stale write returns `conflict`. */
export type ReminderPrefsApi = {
  get: () => Promise<ApiResult<ReminderPrefs>>;
  update: (input: unknown, expectedVersion: number) => Promise<ApiResult<ReminderPrefs>>;
};
