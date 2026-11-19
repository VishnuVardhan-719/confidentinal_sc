import { z } from "zod";

/**
 * Patient in-app notifications. A notification carries a kind and IDs only; the visible text comes
 * from localized templates (patient.notifications.kind.*), so no free text, health detail, name,
 * phone or address can travel in a notification. There is no backend contract yet
 * (docs/frontend/REQUESTS.md R-FE-D-34).
 */
export const NOTIFICATION_KINDS = ["booking_accepted", "booking_declined", "visit_reminder", "record_ready", "payment_due"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const isoTime = z.iso.datetime({ offset: true });
/** Locale-less in-app path, e.g. "/patient/records/<id>". Never an external URL. */
const appPath = z.string().regex(/^\/patient(\/[A-Za-z0-9-]+)+$/);

export const notificationSchema = z.strictObject({
  id: z.string().min(1).max(64),
  kind: z.enum(NOTIFICATION_KINDS),
  createdAt: isoTime,
  readAt: isoTime.nullable(),
  /** Public booking reference (e.g. SYN-BKG-0102); not PHI. */
  bookingReference: z.string().min(1).max(32).nullable(),
  href: appPath.nullable(),
});
export type PatientNotification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.array(notificationSchema).max(200);

export const markReadInputSchema = z.strictObject({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) });
export type MarkReadInput = z.infer<typeof markReadInputSchema>;
