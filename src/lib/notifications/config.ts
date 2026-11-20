import { isEnabled } from "@/lib/feature-flags";
import { externalKeys, locales } from "./render";
import type { Channel } from "./adapters/types";

/** Validation is fail closed. No vendor adapter, WhatsApp automation or external
 * translation is approved by this task. In-app rendering still falls back to EN. */
export function notificationEnv(source: Record<string, string | undefined> = process.env): { channels: Channel[] } {
  const channels: Channel[] = [];
  for (const [channel, flag] of [["sms", "notifySms"], ["email", "notifyEmail"], ["whatsapp", "notifyWhatsapp"]] as const) {
    if (!isEnabled(flag, source)) continue;
    if (channel === "whatsapp") throw new Error("whatsapp_unapproved");
    if (source[`NOTIFY_${channel.toUpperCase()}_ADAPTER`] !== "log") throw new Error("adapter_unavailable");
    if (Object.values(locales).some(templates => externalKeys.some(key => !templates[key].reviewed))) throw new Error("unreviewed_template");
    channels.push(channel);
  }
  return { channels };
}
