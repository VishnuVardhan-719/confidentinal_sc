import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { z } from "zod";
import { failurePageSchema, inboxPageSchema, preferenceSchema, readSchema } from "./schemas";
import { inbox, notificationCommand, preferences, unreadCount } from "./service";

type Operation = "inbox" | "unreadCount" | "read" | "preferences" | "setPreference" | "failures";
export function notificationRoute(operation: Operation) {
  return async (request: Request) => endpoint(async () => {
    await connection();
    const { db } = await session(request);
    switch (operation) {
      case "inbox": return json(await inbox(db, query(request, inboxPageSchema)));
      case "unreadCount":
        query(request, z.object({}).strict());
        return json({ count: await unreadCount(db) });
      case "preferences":
        query(request, z.object({}).strict());
        return json({ preferences: await preferences(db) });
      case "failures": {
        const v = query(request, failurePageSchema);
        return json({ failures: await notificationCommand(db, "list_notification_failures", { p_limit: v.limit, p_after: v.after ?? null }) });
      }
      case "read": {
        const v = await input(request, readSchema);
        const count = "ids" in v
          ? await notificationCommand(db, "mark_notifications_read", { p_ids: v.ids })
          : await notificationCommand(db, "mark_all_notifications_read", { p_before: v.before });
        return json({ count });
      }
      case "setPreference": {
        const v = await input(request, preferenceSchema);
        return json({ version: await notificationCommand(db, "set_notification_preference", {
          p_channel: v.channel, p_topic: v.topic, p_enabled: v.enabled, p_notice_version: v.noticeVersion, p_expected_version: v.expectedVersion,
        }) });
      }
    }
  });
}
