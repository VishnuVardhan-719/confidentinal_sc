import { APP_DEMO_BOOKINGS } from "@/lib/demo/app";
import { DEMO_BOOKINGS, DEMO_PENDING_VERIFICATIONS, providerById, type DemoBooking, type DemoProvider } from "@/lib/demo/data";

/**
 * Pure helpers over the synthetic demo data. Screens read demo rows only through here and
 * demo-store, so swapping in the real API later touches these two files, not every screen.
 */

export type BookingStatus = DemoBooking["status"];
export type Decision = "approved" | "rejected";
export type DemoApplication = { id: string; name: string; kind: string; submittedAt: string };

export type DemoState = {
  /** Requests created in this tab through /book. */
  created: DemoBooking[];
  /** Status changes made in this tab (provider accept/decline), keyed by booking id. */
  status: Record<string, BookingStatus>;
  /** Admin decisions made in this tab, keyed by application id. */
  decisions: Record<string, Decision>;
  /** Profiles submitted in this tab through /provider/onboarding. */
  applications: DemoApplication[];
  profile?: { name: string; phone: string; email: string; language: string };
};

export const EMPTY_DEMO_STATE: DemoState = { created: [], status: {}, decisions: {}, applications: [] };

export type DemoAction =
  | { type: "createBooking"; booking: DemoBooking }
  | { type: "setStatus"; id: string; status: BookingStatus }
  | { type: "decide"; id: string; decision: Decision | null }
  | { type: "submitApplication"; application: DemoApplication }
  | { type: "saveProfile"; profile: NonNullable<DemoState["profile"]> }
  | { type: "reset" };

/** Provider responses are only valid from "requested"; anything else is ignored. */
const RESPONSES: readonly BookingStatus[] = ["accepted", "declined"];

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "createBooking":
      return { ...state, created: [...state.created, action.booking] };
    case "setStatus": {
      const current = allBookings(state).find((b) => b.id === action.id);
      if (!current || current.status !== "requested" || !RESPONSES.includes(action.status)) return state;
      return { ...state, status: { ...state.status, [action.id]: action.status } };
    }
    case "decide": {
      const decisions = { ...state.decisions };
      if (action.decision) decisions[action.id] = action.decision;
      else delete decisions[action.id];
      return { ...state, decisions };
    }
    case "submitApplication":
      return { ...state, applications: [...state.applications, action.application] };
    case "saveProfile":
      return { ...state, profile: action.profile };
    case "reset":
      return EMPTY_DEMO_STATE;
  }
}

/** Shared demo bookings + this screen's extras + this tab's requests, with this tab's status changes applied. */
export function allBookings(state: DemoState): DemoBooking[] {
  return [...DEMO_BOOKINGS, ...APP_DEMO_BOOKINGS, ...state.created].map((b) =>
    state.status[b.id] ? { ...b, status: state.status[b.id]! } : b,
  );
}

export function allApplications(state: DemoState): DemoApplication[] {
  return [...DEMO_PENDING_VERIFICATIONS, ...state.applications];
}

const byStart = (a: DemoBooking, b: DemoBooking) => a.startsAt.localeCompare(b.startsAt);

/** Upcoming = still open (requested or accepted). Past = finished either way. Decided by status, not the clock. */
export function splitVisits(bookings: readonly DemoBooking[]) {
  return {
    upcoming: bookings.filter((b) => b.status === "requested" || b.status === "accepted").sort(byStart),
    past: bookings
      .filter((b) => b.status === "completed" || b.status === "cancelled" || b.status === "declined")
      .sort((a, b) => byStart(b, a)),
  };
}

/** Slots a provider already holds for an open request, so the picker can mark them as taken. */
export function takenSlots(bookings: readonly DemoBooking[], providerId: string): Set<string> {
  return new Set(
    bookings
      .filter((b) => b.providerId === providerId && (b.status === "requested" || b.status === "accepted"))
      .map((b) => b.startsAt),
  );
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Waiting for provider",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
};

export const PAYMENT_LABEL = "Payment not collected";

/** The provider and admin screens act as these demo users until demo sign-in (t27) provides a session. */
export const DEMO_PROVIDER_ID = "demo-dr-1";
export const DEMO_PATIENT_NAME = "Demo Patient One";

/** Category slug on the public site -> demo provider kind. Caretakers have no demo providers. */
export const KIND_FOR_SERVICE = {
  doctor: "doctor",
  lab: "lab",
  "scheduled-ambulance": "ambulance",
  caretaker: null,
} as const satisfies Record<string, DemoProvider["kind"] | null>;

export type ServiceType = keyof typeof KIND_FOR_SERVICE;

export function serviceTypeForKind(kind: DemoProvider["kind"]): ServiceType {
  return kind === "ambulance" ? "scheduled-ambulance" : kind;
}

export function lookupBooking(b: DemoBooking) {
  const provider = providerById(b.providerId);
  const service = provider?.services.find((s) => s.id === b.serviceId);
  return { provider, service };
}

const IST = "Asia/Kolkata";

/** "Wed, 2 Dec" in India time. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).format(
    new Date(iso),
  );
}

/** Weekday, day and month of an instant in India time, for a calendar-style date block. */
export function dateParts(iso: string): { weekday: string; day: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).formatToParts(
    new Date(iso),
  );
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** "10:00 am" in India time. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .format(new Date(iso))
    .toLowerCase();
}

/** "Wed, 2 Dec, 10:00 am IST". */
export function formatSlot(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)} IST`;
}

/** YYYY-MM-DD of an instant in India time, for grouping slots by day. */
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export type BookingPrefill = { service?: ServiceType; providerId?: string; serviceId?: string; slot?: string };

/**
 * Reads /book?provider=..&service=..&slot=.. links from provider profiles. Query values are untrusted:
 * each is kept only if it names a real demo provider, one of its services, or one of its slots.
 */
export function prefillFromParams(params: { get(name: string): string | null } | null): BookingPrefill {
  const provider = providerById(params?.get("provider") ?? "");
  if (!provider) return {};
  const serviceId = params?.get("service") ?? "";
  const slot = params?.get("slot") ?? "";
  return {
    service: serviceTypeForKind(provider.kind),
    providerId: provider.id,
    serviceId: provider.services.some((s) => s.id === serviceId) ? serviceId : undefined,
    slot: provider.slots.includes(slot) ? slot : undefined,
  };
}
