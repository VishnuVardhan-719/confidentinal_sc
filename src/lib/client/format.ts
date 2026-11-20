/* Display formatting for the app screens. All times are shown in India time (IST, Asia/Kolkata). */

const IST = "Asia/Kolkata";

const dayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
const keyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const rupeesPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** "Wed, 2 Dec" in India time. */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** Weekday, day and month of an instant in India time, for a calendar-style date block. */
export function dateParts(iso: string): { weekday: string; day: string; month: string } {
  const parts = dayFormat.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "10:00 am" in India time. */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso)).toLowerCase();
}

/** "Wed, 2 Dec, 10:00 am IST". */
export function formatSlot(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)} IST`;
}

/** YYYY-MM-DD of an instant in India time. */
export function dayKey(iso: string | Date): string {
  return keyFormat.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Today's date in India, and the date `days` later, as YYYY-MM-DD. */
export function istDate(days = 0, now: Date = new Date()): string {
  return dayKey(new Date(now.getTime() + days * 86_400_000));
}

/** "Wed, 2 Dec" for a YYYY-MM-DD date. Noon UTC keeps the calendar day the same in India. */
export function formatDateKey(key: string): string {
  return formatDay(`${key}T12:00:00.000Z`);
}

/**
 * Integer paise from the server (a decimal string) as rupees: "150000" -> "₹1,500". The server is the only
 * source of a price; this never rounds, adds or converts anything except for display.
 */
export function formatPaise(paise: string): string {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(paise)) return "Price unavailable";
  const value = BigInt(paise);
  const whole = Number(value / BigInt(100));
  const rest = Number(value % BigInt(100));
  return rest === 0 ? rupees.format(whole) : rupeesPaise.format(whole + rest / 100);
}

export const UNIT_LABEL: Record<string, string> = {
  visit: "per visit",
  test: "per test",
  trip: "per trip",
  hour: "per hour",
  day: "per day",
};
