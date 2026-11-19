import type { QuietHours, ReminderChannel, ReminderPrefs } from "./types";
import { REMINDER_CHANNELS } from "./types";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes past midnight in India (IST) for a UTC instant. */
export function istMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** True when quiet hours are on and `now` (IST) falls inside them; the window may span midnight. End is exclusive. */
export function inQuietHours(q: QuietHours, now: Date): boolean {
  if (!q.enabled || q.start === q.end) return false;
  const t = istMinutes(now);
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export const spansMidnight = (q: QuietHours) => q.enabled && minutes(q.start) > minutes(q.end);

export function enabledChannels(p: Pick<ReminderPrefs, "channels">): ReminderChannel[] {
  return REMINDER_CHANNELS.filter((c) => p.channels[c]);
}
