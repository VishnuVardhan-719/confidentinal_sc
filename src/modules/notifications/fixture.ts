import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticNotification } from "@/fixtures/marketplace/notifications";
import { markReadSchema, type Notification } from "./schemas";
import type { NotificationsApi } from "./api";
export function createNotificationsFixtureApi(options: { env?: FixtureEnvironment; scenario?: "empty" | "unread" } = {}): NotificationsApi {
  const guard = fixtureGuard(options.env);
  const rows = new Map<string, Notification>(options.scenario === "empty" ? [] : [[syntheticNotification.id, structuredClone(syntheticNotification)]]);
  return {
    async list() { guard(); return ok({ items: structuredClone([...rows.values()]) }); },
    async markRead(id, input) {
      guard(); const parsed = markReadSchema.safeParse(input);
      if (!z.uuid().safeParse(id).success || !parsed.success) return fail("validation");
      const row = rows.get(id); if (!row) return fail("not_found");
      if (row.version !== parsed.data.expectedVersion) return fail("conflict");
      if (!row.readAt) { row.readAt = new Date().toISOString(); row.version++; }
      return ok(structuredClone(row));
    },
  };
}
