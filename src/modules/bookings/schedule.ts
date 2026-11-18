import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { scheduleStepSchema } from "./wizard";
const localScheduleSchema = z.strictObject({ date: z.iso.date(), time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/), durationMinutes: z.number().int().min(1).max(10080) });
/** Explicit India wall time conversion; never depends on the browser/server timezone. */
export function kolkataScheduleToUtc(input: unknown, nowUtc: string = new Date().toISOString()): ApiResult<z.infer<typeof scheduleStepSchema>> {
  const value = localScheduleSchema.safeParse(input);
  if (!value.success || !z.iso.datetime().safeParse(nowUtc).success) return fail("validation");
  const startAt = new Date(value.data.date + "T" + value.data.time + ":00+05:30").toISOString();
  if (Date.parse(startAt) <= Date.parse(nowUtc)) return fail("validation");
  return ok({ startAt, endAt: new Date(Date.parse(startAt) + value.data.durationMinutes * 60_000).toISOString() });
}
