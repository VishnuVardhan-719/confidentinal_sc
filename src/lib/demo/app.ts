/**
 * Extra SYNTHETIC rows for the signed-in app screens (patient, provider, admin dashboards).
 * Same rules as ./data.ts: not real people, prices or availability; every screen showing them
 * renders DEMO_LABEL. Kept separate so ./data.ts stays identical across worktrees.
 */
import type { DemoBooking } from "./data";

const d = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 11, day, h, m)).toISOString();

export const APP_DEMO_BOOKINGS: DemoBooking[] = [
  // A past visit for the demo patient, so "Past visits" is not empty.
  { id: "demo-b-app-1", providerId: "demo-dr-2", serviceId: "s1", patientName: "Demo Patient One", startsAt: d(1, 5), status: "completed", paymentStatus: "not_collected" },
  // More traffic for the demo doctor (demo-dr-1), so the provider inbox and schedule have rows.
  { id: "demo-b-app-2", providerId: "demo-dr-1", serviceId: "s2", patientName: "Demo Patient Three", startsAt: d(3, 9), status: "requested", paymentStatus: "not_collected" },
  { id: "demo-b-app-3", providerId: "demo-dr-1", serviceId: "s1", patientName: "Demo Patient Four", startsAt: d(2, 5), status: "accepted", paymentStatus: "not_collected" },
];
