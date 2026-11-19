import { fail } from "@/lib/api/result";
import type { NotificationsApi } from "./patient-api";

/**
 * No notifications endpoint exists in docs/API_CONTRACTS.md yet (REQUESTS R-FE-D-34). The http
 * adapter therefore reports "gated" (not connected) instead of guessing a URL or showing nothing.
 */
export function createPatientNotificationsHttpApi(): NotificationsApi {
  return {
    listMine: async () => fail("gated"),
    markRead: async () => fail("gated"),
  };
}
