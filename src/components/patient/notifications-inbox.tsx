"use client";

import { useRef } from "react";
import { NotificationList } from "@/components/notifications/notification-list";
import type { NotificationView } from "@/components/notifications/notifications";
import type { ApiResult } from "@/lib/api/result";

/**
 * Patient inbox: binds each notification's server version to the mark-read action so the server can
 * refuse a stale write (conflict), which the list then rolls back.
 */
export function NotificationsInbox({
  items,
  versions,
  markRead,
}: {
  items: NotificationView[];
  versions: Record<string, number>;
  markRead: (id: string, expectedVersion: number) => Promise<ApiResult<{ version: number }>>;
}) {
  const current = useRef<Record<string, number>>({ ...versions });
  return (
    <NotificationList
      view={{ kind: "ready", data: items }}
      onMarkRead={async (id) => {
        const version = current.current[id];
        if (version === undefined) return { ok: false, code: "not_found" };
        const r = await markRead(id, version);
        if (!r.ok) return { ok: false, code: r.error.code };
        current.current[id] = r.data.version;
        return { ok: true };
      }}
    />
  );
}
