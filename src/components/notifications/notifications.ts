/** Notification kinds the UI has copy for (mirrors the notifications module schema). */
export const NOTIFICATION_KINDS = [
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_cancelled",
  "payment_update",
  "report_available",
  "shift_update",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationView = {
  id: string;
  /** Unknown kinds render as a generic "You have an update". */
  kind: NotificationKind | (string & {});
  /** UTC ISO timestamp from the server. */
  occurredAt: string;
  read: boolean;
  /** Locale-less internal path to the authorized detail page (no PHI in the path). */
  href?: string | null;
};

/** Apply local optimistic read flags on top of server data, newest first. */
export function applyReadState(items: readonly NotificationView[], overrides: Readonly<Record<string, boolean>>): NotificationView[] {
  return items
    .map((n) => (Object.prototype.hasOwnProperty.call(overrides, n.id) ? { ...n, read: n.read || overrides[n.id] } : n))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

/** Only internal, single-slash paths may be linked from a notification. */
export function isInternalPath(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !/[\s\\]/.test(href);
}
