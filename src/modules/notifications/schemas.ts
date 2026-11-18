import { z } from "zod";
import { utcSchema, versionSchema } from "@/modules/catalog/schemas";
export const notificationSchema = z.object({ id: z.uuid(), kind: z.enum(["booking_requested", "booking_accepted", "booking_declined", "booking_cancelled", "payment_update", "report_available", "shift_update"]),
  bookingId: z.uuid().nullable(), occurredAt: utcSchema, readAt: utcSchema.nullable(), version: versionSchema, synthetic: z.boolean() });
export type Notification = z.infer<typeof notificationSchema>;
export const markReadSchema = z.strictObject({ expectedVersion: versionSchema });
/** Carries the exact prior snapshot for caller rollback; do not overwrite a newer response. */
export type NotificationReadChange = { before: Notification; after: Notification };
export function optimisticMarkRead(before: Notification, readAt: string): NotificationReadChange {
  const safe = notificationSchema.parse(before);
  return { before: structuredClone(safe), after: { ...safe, readAt: safe.readAt ?? utcSchema.parse(readAt) } };
}
export function rollbackMarkRead(current: Notification, change: NotificationReadChange): Notification {
  return current.id === change.after.id && current.version === change.after.version && current.readAt === change.after.readAt
    ? structuredClone(change.before) : current;
}
