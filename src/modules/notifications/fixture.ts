import { fail, ok } from "@/lib/api/result";
import { assertFixtureAllowed, clone, FIXTURE_IDS as I, type FixtureActor } from "@/fixtures/clinical/world";
import type { NotificationsApi } from "./api";
import { markReadInputSchema, type PatientNotification } from "./types";

type Env = Record<string, string | undefined>;

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

/** Synthetic notifications for fixture patient A. IDs and references only, never PHI. */
export function seedNotifications(now: Date = new Date()): PatientNotification[] {
  return [
    { id: "syn-ntf-004", kind: "visit_reminder", createdAt: minutesAgo(now, 20), readAt: null, bookingReference: "SYN-BKG-0102", href: `/patient/bookings/${I.bookingToday}` },
    { id: "syn-ntf-003", kind: "booking_accepted", createdAt: minutesAgo(now, 3 * 60), readAt: null, bookingReference: "SYN-BKG-0102", href: `/patient/bookings/${I.bookingToday}` },
    { id: "syn-ntf-002", kind: "record_ready", createdAt: minutesAgo(now, 7 * 24 * 60 - 50), readAt: minutesAgo(now, 6 * 24 * 60), bookingReference: "SYN-BKG-0104", href: `/patient/records/${I.consultationPastFinal}` },
    { id: "syn-ntf-001", kind: "booking_declined", createdAt: minutesAgo(now, 10 * 24 * 60), readAt: minutesAgo(now, 9 * 24 * 60), bookingReference: null, href: null },
  ];
}

type Store = { byPatient: Map<string, PatientNotification[]> };
const GLOBAL_KEY = Symbol.for("scv.fixture.notifications");

/** Process-wide synthetic store, like the clinical fixture world (state survives requests, not restarts). */
function sharedStore(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  g[GLOBAL_KEY] ??= { byPatient: new Map([[I.patientA, seedNotifications()]]) };
  return g[GLOBAL_KEY];
}

export function createNotificationsFixtureApi({ env = process.env, actor, store = sharedStore(), now = () => new Date() }: { env?: Env; actor: FixtureActor; store?: Store; now?: () => Date }): NotificationsApi {
  assertFixtureAllowed(env);
  const patientId = actor.role === "patient" ? actor.patientId : null;
  return {
    listMine: async () => {
      if (!patientId) return fail("forbidden");
      const items = store.byPatient.get(patientId) ?? [];
      return ok(clone(items).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    markRead: async (input) => {
      if (!patientId) return fail("forbidden");
      const parsed = markReadInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const wanted = new Set(parsed.data.ids);
      const at = now().toISOString();
      let updated = 0;
      const next = (store.byPatient.get(patientId) ?? []).map((n) => {
        if (!wanted.has(n.id) || n.readAt) return n;
        updated++;
        return { ...n, readAt: at };
      });
      store.byPatient.set(patientId, next);
      return ok({ updated });
    },
  };
}

export const createNotificationsTestStore = (now?: Date): Store => ({ byPatient: new Map([[I.patientA, seedNotifications(now)]]) });
