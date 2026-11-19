import type { Booking, BookingEvent } from "@/modules/bookings/schemas";
import type { PatientAddress } from "@/modules/patient/schemas";
import type { PaymentSummary } from "@/modules/payments/schemas";
import { syntheticBooking } from "./bookings";
import { SYNTHETIC_DOCTORS } from "./doctors";
import { SYNTHETIC_POLICY_ID, syntheticAddresses } from "./patient";
import { syntheticPayment } from "./payments";

/**
 * Process-wide synthetic marketplace state for the fixture adapter (never production; the adapters
 * that read it call the fixture guard on every operation). It lets one browser journey create a
 * request, see the synthetic provider's decision, cancel or reschedule, and read it back across
 * requests. In-memory only: restarting the server resets it. Nothing here is a real person or booking.
 *
 * Synthetic provider behaviour (documented so tests and reviewers can rely on it):
 * - "Synthetic doctor 2" (provider ...0101) declines every request as unavailable.
 * - Every other synthetic provider accepts, then the booking is confirmed with a server-made reference.
 * - The decision lands `responseDelayMs` after the request (FIXTURE_PROVIDER_RESPONSE_MS, default 3000),
 *   so the patient first sees an honest "waiting for the doctor" state and must refresh to see changes.
 */
export const SYNTHETIC_DECLINING_PROVIDER_ID = "00000000-0000-4000-8000-000000000101";
/** A past, completed and paid synthetic visit with an issued receipt (the receipt journey). */
export const SYNTHETIC_COMPLETED_BOOKING_ID = "00000000-0000-4000-8000-000000000071";
export const SYNTHETIC_CANCELLATION_POLICY = { id: SYNTHETIC_POLICY_ID, published: true, cancelWindowMinutes: 120 } as const;

export type SyntheticMarketplaceStore = {
  records: Map<string, Booking>;
  events: Map<string, BookingEvent[]>;
  intents: Map<string, { body: string; id: string }>;
  addresses: PatientAddress[];
  payments: Map<string, PaymentSummary>;
  /** Server time (ms) when the synthetic provider answers a REQUESTED booking. */
  respondAt: Map<string, number>;
  /** Apply every synthetic provider decision that is due at `now`. */
  tick(now: Date): void;
};

const KEY = Symbol.for("surecure.synthetic-marketplace-store");
type Holder = { [KEY]?: SyntheticMarketplaceStore };

function responseDelay(env: Record<string, string | undefined>): number {
  const raw = Number(env.FIXTURE_PROVIDER_RESPONSE_MS ?? "3000");
  return Number.isSafeInteger(raw) && raw >= 0 && raw <= 600_000 ? raw : 3000;
}

/** Short, server-made display reference. The browser never derives references. */
function referenceFor(id: string): string {
  return "SCV-" + id.replace(/-/g, "").slice(-6).toUpperCase();
}

function event(row: Booking, actorRole: BookingEvent["actorRole"], at: Date): BookingEvent {
  return { id: crypto.randomUUID(), bookingId: row.id, status: row.status, version: row.version, occurredAt: at.toISOString(), actorRole, synthetic: true };
}

export function createSyntheticMarketplaceStore(env: Record<string, string | undefined> = process.env, now: () => Date = () => new Date()): SyntheticMarketplaceStore {
  const delay = responseDelay(env);
  const store: SyntheticMarketplaceStore = {
    records: new Map(), events: new Map(), intents: new Map(), addresses: syntheticAddresses(), payments: new Map(), respondAt: new Map(),
    tick(at) {
      for (const [id, due] of store.respondAt) {
        if (due > at.getTime()) continue;
        store.respondAt.delete(id);
        const row = store.records.get(id);
        if (!row || row.status !== "REQUESTED") continue;
        const when = new Date(due);
        const append = (value: BookingEvent) => store.events.set(id, [...store.events.get(id) ?? [], value]);
        if (row.providerId === SYNTHETIC_DECLINING_PROVIDER_ID) {
          row.status = "DECLINED"; row.version++; append(event(row, "provider", when));
          store.payments.set(id, { ...syntheticPayment(id, "NOT_INITIATED"), amountDuePaise: 0 });
          continue;
        }
        row.status = "ACCEPTED"; row.version++; append(event(row, "provider", when));
        row.status = "CONFIRMED"; row.version++; append(event(row, "system", when));
        row.publicReference ??= referenceFor(id);
        row.doctorOperationalStatus = row.category === "doctor" ? "SCHEDULED" : null;
        const prior = store.payments.get(id);
        store.payments.set(id, { ...syntheticPayment(id, "DUE"), amountDuePaise: row.priceSnapshot.amountPaise, version: (prior?.version ?? 0) + 1 });
      }
    },
  };
  // Seed: one completed, paid (pay-after, recorded by the provider) synthetic visit that has a receipt.
  const doctor = SYNTHETIC_DOCTORS[0];
  const done = syntheticBooking(SYNTHETIC_COMPLETED_BOOKING_ID);
  const start = new Date(now().getTime() - 3 * 24 * 60 * 60 * 1000);
  start.setUTCMinutes(30, 0, 0); start.setUTCHours(4);
  done.startAt = start.toISOString(); done.endAt = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
  done.providerId = doctor.providerId; done.serviceId = doctor.serviceId; done.priceSnapshot.amountPaise = doctor.feePaise;
  done.publicReference = referenceFor(done.id); done.status = "COMPLETED"; done.version = 4; done.doctorOperationalStatus = "SERVICE_COMPLETED";
  store.records.set(done.id, done);
  store.events.set(done.id, (["REQUESTED", "ACCEPTED", "CONFIRMED", "COMPLETED"] as const).map((status, index) => ({
    id: `00000000-0000-4000-8009-00000000007${index}`, bookingId: done.id, status, version: index + 1,
    occurredAt: new Date(start.getTime() - (3 - index) * 60 * 60 * 1000 + (index === 3 ? 4 * 60 * 60 * 1000 : 0)).toISOString(),
    actorRole: index === 0 ? "patient" : index === 3 ? "assigned" : "provider", synthetic: true,
  })));
  store.payments.set(done.id, { ...syntheticPayment(done.id, "PAID"), collectedPaise: doctor.feePaise, version: 2 });
  void delay;
  Object.defineProperty(store, "responseDelayMs", { value: delay, enumerable: false });
  return store;
}

export function syntheticResponseDelayMs(store: SyntheticMarketplaceStore): number {
  return (store as SyntheticMarketplaceStore & { responseDelayMs?: number }).responseDelayMs ?? 3000;
}

/** The one shared store for this server process (fixture mode only). */
export function sharedSyntheticMarketplace(env: Record<string, string | undefined> = process.env): SyntheticMarketplaceStore {
  const holder = globalThis as Holder;
  holder[KEY] ??= createSyntheticMarketplaceStore(env);
  return holder[KEY];
}
