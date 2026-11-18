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
  // One open request each for the demo lab and the demo scheduled-ambulance operator.
  { id: "demo-b-app-4", providerId: "demo-lab-1", serviceId: "s2", patientName: "Demo Patient Three", startsAt: d(4, 2, 30), status: "requested", paymentStatus: "not_collected" },
  { id: "demo-b-app-5", providerId: "demo-amb-1", serviceId: "s1", patientName: "Demo Patient One", startsAt: d(6, 5), status: "requested", paymentStatus: "not_collected" },
];

/** People the demo caretaker supports. The caretaker sees their visits read-only; nothing clinical. */
export const DEMO_CARETAKER_LINKS: { patientName: string; relation: string; city: string }[] = [
  { patientName: "Demo Patient One", relation: "Family member (demo)", city: "Hyderabad" },
  { patientName: "Demo Patient Two", relation: "Home support client (demo)", city: "Hyderabad" },
];
