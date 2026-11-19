import type { AssignedVisitView } from "./types";

/** India Standard Time, the only display zone (times are stored as UTC). */
export const SCHEDULE_TIME_ZONE = "Asia/Kolkata";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: SCHEDULE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" of the instant in IST. */
export const istDayKey = (d: Date): string => dayKeyFormat.format(d);

export type ScheduleDay<V> = { dayKey: string; /** Noon IST of that day, for display formatting. */ date: Date; visits: V[] };

/** Bookings that occupy the doctor's time (requests and closed bookings are not on the schedule). */
const BOOKED = new Set(["accepted", "confirmed", "in_progress"]);

/**
 * Read-only schedule: the next `days` IST calendar days starting today, each with its booked
 * visits in start order. Days without visits are kept so free days are visible. Visits outside the
 * window or not in a booked state are left out. Pure; the server list stays authoritative.
 */
export function buildSchedule<V extends Pick<AssignedVisitView, "scheduledStartAt" | "state">>(visits: V[], now: Date, days = 7): ScheduleDay<V>[] {
  const out: ScheduleDay<V>[] = [];
  const todayKey = istDayKey(now);
  // Noon IST of today = 06:30 UTC on the IST calendar date.
  const todayNoon = new Date(`${todayKey}T06:30:00.000Z`);
  for (let i = 0; i < days; i++) {
    const date = new Date(todayNoon.getTime() + i * 86_400_000);
    out.push({ dayKey: istDayKey(date), date, visits: [] });
  }
  const byKey = new Map(out.map((d) => [d.dayKey, d]));
  for (const v of visits) {
    if (!BOOKED.has(v.state)) continue;
    const start = new Date(v.scheduledStartAt);
    if (Number.isNaN(start.getTime())) continue;
    byKey.get(istDayKey(start))?.visits.push(v);
  }
  for (const d of out) d.visits.sort((a, b) => Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt));
  return out;
}
