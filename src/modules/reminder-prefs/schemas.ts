import { z } from "zod";
import { REMINDER_CHANNELS, type ReminderField, type ReminderIssue, type ReminderPrefs, type ReminderPrefsInput } from "./types";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const channelsSchema = z.strictObject(Object.fromEntries(REMINDER_CHANNELS.map((c) => [c, z.boolean()])) as Record<(typeof REMINDER_CHANNELS)[number], z.ZodBoolean>);

export const reminderPrefsInputSchema = z
  .strictObject({
    channels: channelsSchema,
    quietHours: z.strictObject({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  })
  .superRefine((v, ctx) => {
    if (!v.quietHours.enabled) return;
    const startOk = HHMM.test(v.quietHours.start);
    const endOk = HHMM.test(v.quietHours.end);
    if (!startOk) ctx.addIssue({ code: "custom", path: ["quietHours", "start"], message: "quiet_start_invalid" });
    if (!endOk) ctx.addIssue({ code: "custom", path: ["quietHours", "end"], message: "quiet_end_invalid" });
    if (startOk && endOk && v.quietHours.start === v.quietHours.end) ctx.addIssue({ code: "custom", path: ["quietHours", "end"], message: "quiet_same" });
  });

export type ReminderValidation =
  | { ok: true; data: ReminderPrefsInput }
  | { ok: false; issues: { field: ReminderField; code: ReminderIssue }[]; malformed?: true };

/** Validate untrusted preferences. When quiet hours are off, the stored times are kept but not checked. */
export function validateReminderPrefs(raw: unknown): ReminderValidation {
  const parsed = reminderPrefsInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues: { field: ReminderField; code: ReminderIssue }[] = [];
  for (const i of parsed.error.issues) {
    if (i.path[0] !== "quietHours" || i.code !== "custom") continue;
    const field: ReminderField = i.path[1] === "start" ? "quietStart" : "quietEnd";
    if (!issues.some((x) => x.field === field)) issues.push({ field, code: i.message as ReminderIssue });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: false, issues: [], malformed: true };
}

export const reminderPrefsSchema = z.strictObject({
  channels: channelsSchema,
  quietHours: z.strictObject({ enabled: z.boolean(), start: z.string().regex(HHMM), end: z.string().regex(HHMM) }),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<ReminderPrefs>;

export const versionSchema = z.number().int().positive();
