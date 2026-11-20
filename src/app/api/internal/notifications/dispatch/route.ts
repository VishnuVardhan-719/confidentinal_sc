import { connection } from "next/server";
import { json } from "@/lib/auth/http";
import { notificationEnv } from "@/lib/notifications/config";
import { cronAuthorized, dispatchNotifications } from "@/lib/notifications/dispatch";
import { notificationWorkerClient } from "@/lib/notifications/worker-client";

async function dispatch(request: Request) {
  await connection();
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return json({ error: { code: "unauthenticated" } }, 401);
  try {
    const { channels } = notificationEnv();
    if (channels.length === 0) return json({ claimed: 0, accepted: 0, failed: 0 });
    return json(await dispatchNotifications(notificationWorkerClient(), channels, process.env.APP_ORIGIN ?? ""));
  } catch { return json({ error: { code: "notifications_unavailable" } }, 503); }
}
export const GET = dispatch;
export const POST = dispatch;
