import { z } from "zod";
import { kolkataScheduleToUtc } from "@/modules/bookings/schedule";

/**
 * Patient reschedule request: a preferred new start in India time. There is no reschedule
 * endpoint on B01 (docs/frontend/REVIEW_NEEDED.md), so the server action validates this and
 * returns `gated`. No free-text field: nothing health-related is collected here.
 */
export const rescheduleRequestSchema = z.strictObject({
  bookingId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  date: z.iso.date(),
  time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
});
export type RescheduleRequest = z.infer<typeof rescheduleRequestSchema>;

export type RescheduleFieldError = "date" | "time" | "past";

/** Client and server share this check. Returns the UTC start or the first field problem. */
export function checkReschedule(input: { date: string; time: string }, nowUtc: string): { ok: true; startAt: string } | { ok: false; error: RescheduleFieldError } {
  if (!z.iso.date().safeParse(input.date).success) return { ok: false, error: "date" };
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.time)) return { ok: false, error: "time" };
  const r = kolkataScheduleToUtc({ date: input.date, time: input.time, durationMinutes: 1 }, nowUtc);
  return r.ok ? { ok: true, startAt: r.data.startAt } : { ok: false, error: "past" };
}
