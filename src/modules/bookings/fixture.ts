import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticBookable } from "@/fixtures/marketplace/providers";
import { syntheticBooking } from "@/fixtures/marketplace/bookings";
import { syntheticResponseDelayMs, type SyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { syntheticPayment } from "@/fixtures/marketplace/payments";
import { acceptSchema, bookingListSchema, createBookingSchema, decisionSchema, rescheduleSchema, type Booking, type BookingEvent, type BookingStatus } from "./schemas";
import type { BookingsApi } from "./api";
export type BookingFixtureOptions = {
  env?: FixtureEnvironment;
  scenario?: "empty" | "stale_slot" | "requested" | "accepted" | "declined" | "cancelled" | "cancel_window";
  /** Synthetic backend policy, not production policy or UI approval. Missing means fail closed. */
  cancellationPolicy?: { id: string; published: boolean; cancelWindowMinutes: number };
  now?: () => Date;
  /** Trusted fixture session context, never a mutation payload or production authorization. */
  actorRole?: "patient" | "provider";
  /** Shared synthetic marketplace (fixtures/marketplace/booking-store). When set, state survives across
   * requests, the synthetic provider answers after a delay, and overlapping or past slots are refused. */
  store?: SyntheticMarketplaceStore;
};
const ACTIVE: readonly BookingStatus[] = ["REQUESTED", "ACCEPTED", "CONFIRMED", "IN_PROGRESS"];
/** True when another active booking of the same provider overlaps [startAt, endAt). */
export function overlapsActiveBooking(rows: Iterable<Booking>, providerId: string, startAt: string, endAt: string, exceptId?: string): boolean {
  const start = Date.parse(startAt); const end = Date.parse(endAt);
  for (const row of rows) {
    if (row.id === exceptId || row.providerId !== providerId || !ACTIVE.includes(row.status)) continue;
    if (Date.parse(row.startAt) < end && start < Date.parse(row.endAt)) return true;
  }
  return false;
}
export function createBookingsFixtureApi(options: BookingFixtureOptions = {}): BookingsApi {
  const guard = fixtureGuard(options.env);
  const now = options.now ?? (() => new Date());
  const actorRole = z.enum(["patient", "provider"]).parse(options.actorRole ?? "patient");
  const cancellationPolicy = options.cancellationPolicy && structuredClone(options.cancellationPolicy);
  const store = options.store;
  const records = store?.records ?? new Map<string, Booking>();
  const events = store?.events ?? new Map<string, BookingEvent[]>();
  const intents = store?.intents ?? new Map<string, { body: string; id: string }>();
  const sync = () => store?.tick(now());
  if (!store && options.scenario && !["empty", "stale_slot"].includes(options.scenario)) {
    const row = syntheticBooking("00000000-0000-4000-8000-000000000061");
    const statuses: Record<string, BookingStatus> = { requested: "REQUESTED", accepted: "ACCEPTED", declined: "DECLINED", cancelled: "CANCELLED", cancel_window: "CONFIRMED" };
    row.status = statuses[options.scenario];
    if (options.scenario === "cancel_window") {
      // Deliberately inside every non-negative policy window, without inventing a cutoff.
      row.startAt = new Date(now().getTime() - 1).toISOString();
      row.endAt = new Date(Date.parse(row.startAt) + 60 * 60 * 1000).toISOString();
    }
    records.set(row.id, row);
  }
  function append(row: Booking, actorRole: BookingEvent["actorRole"]) {
    events.set(row.id, [...events.get(row.id) ?? [], { id: crypto.randomUUID(), bookingId: row.id, status: row.status, version: row.version,
      occurredAt: now().toISOString(), actorRole, synthetic: true }]);
  }
  /** Outside the published cancellation window an accepted booking can no longer be changed by the patient. */
  function insideWindow(row: Booking): boolean {
    const policy = cancellationPolicy;
    return !!policy?.published && !!row.priceSnapshot.policyVersionId && policy.id.toLowerCase() === row.priceSnapshot.policyVersionId.toLowerCase()
      && Number.isSafeInteger(policy.cancelWindowMinutes) && policy.cancelWindowMinutes >= 0
      && now().getTime() <= Date.parse(row.startAt) - policy.cancelWindowMinutes * 60_000;
  }
  function change(id: string, input: unknown, action: "accept" | "decline" | "cancel", actor: "patient" | "provider") {
    guard(); sync();
    const parsed = (action === "accept" ? acceptSchema : decisionSchema).safeParse(input);
    if (!z.uuid().safeParse(id).success || !parsed.success) return fail("validation");
    const row = records.get(id.toLowerCase());
    if (!row) return fail("not_found");
    if (parsed.data.expectedVersion !== row.version || (action === "cancel" ? !["DRAFT", "REQUESTED", "ACCEPTED", "CONFIRMED"].includes(row.status) : row.status !== "REQUESTED")) return fail("conflict");
    if (action === "cancel" && ["ACCEPTED", "CONFIRMED"].includes(row.status) && !insideWindow(row)) return fail("conflict");
    if (action === "accept") {
      const count = row.category === "ambulance" ? 2 : 1;
      const resources = acceptSchema.parse(input).resourceIds;
      if (resources.length !== count) return fail("validation");
      row.status = "ACCEPTED"; row.version++; append(row, actor);
      row.status = "CONFIRMED"; row.version++; append(row, actor);
      row.doctorOperationalStatus = row.category === "doctor" ? "SCHEDULED" : null;
    } else {
      if (action === "decline" && decisionSchema.parse(input).reason === "patient_request") return fail("validation");
      row.status = action === "decline" ? "DECLINED" : "CANCELLED";
      row.version++; append(row, actor);
      if (store) { store.respondAt.delete(row.id); const pay = store.payments.get(row.id); if (pay && pay.collectedPaise === 0) store.payments.set(row.id, { ...pay, status: "NOT_INITIATED", amountDuePaise: 0, version: pay.version + 1 }); }
    }
    return ok({ version: row.version });
  }
  return {
    async create(input, key) {
      guard();
      const parsed = createBookingSchema.safeParse(input);
      if (!parsed.success || !z.uuid().safeParse(key).success) return fail("validation");
      const body = JSON.stringify(parsed.data);
      const prior = intents.get(key);
      if (prior) return prior.body === body ? ok({ id: prior.id }) : fail("conflict");
      if (options.scenario === "stale_slot") return fail("conflict");
      const provider = syntheticBookable(parsed.data.serviceId);
      if (!provider) return fail("not_found");
      const id = crypto.randomUUID();
      const row = syntheticBooking(id);
      row.serviceId = provider.serviceId; row.providerId = provider.id; row.category = provider.category;
      row.pin = provider.pin; row.priceSnapshot.amountPaise = provider.amountPaise;
      row.startAt = new Date(parsed.data.startAt).toISOString();
      row.endAt = new Date(Date.parse(row.startAt) + 60 * 60 * 1000).toISOString();
      if (store) {
        if (Date.parse(row.startAt) <= now().getTime()) return fail("validation");
        if (!store.addresses.some(address => address.id === parsed.data.addressId.toLowerCase() && address.pin === row.pin)) return fail("validation");
        if (overlapsActiveBooking(records.values(), row.providerId, row.startAt, row.endAt)) return fail("conflict");
      }
      records.set(id, row); intents.set(key, { body, id }); append(row, "patient");
      if (store) {
        store.respondAt.set(id, now().getTime() + syntheticResponseDelayMs(store));
        store.payments.set(id, { ...syntheticPayment(id, "NOT_INITIATED"), amountDuePaise: row.priceSnapshot.amountPaise });
      }
      return ok({ id });
    },
    async list(filters = {}) {
      guard(); sync(); const parsed = bookingListSchema.safeParse(filters);
      if (!parsed.success) return fail("validation");
      return ok({ items: structuredClone([...records.values()].filter(row => (!parsed.data.providerId || row.providerId === parsed.data.providerId)
        && (!parsed.data.cursor || row.id > parsed.data.cursor)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, parsed.data.limit)) });
    },
    async get(id) { guard(); sync(); if (!z.uuid().safeParse(id).success) return fail("validation"); const row = records.get(id.toLowerCase()); return row ? ok(structuredClone(row)) : fail("not_found"); },
    async accept(id, input) { return change(id, input, "accept", "provider"); },
    async decline(id, input) { return change(id, input, "decline", "provider"); },
    async cancel(id, input) { return change(id, input, "cancel", actorRole); },
    async reschedule(id, input) {
      guard(); sync();
      const parsed = rescheduleSchema.safeParse(input);
      if (!z.uuid().safeParse(id).success || !parsed.success) return fail("validation");
      const row = records.get(id.toLowerCase());
      if (!row) return fail("not_found");
      if (parsed.data.expectedVersion !== row.version || !["REQUESTED", "ACCEPTED", "CONFIRMED"].includes(row.status)) return fail("conflict");
      if (row.status !== "REQUESTED" && !insideWindow(row)) return fail("conflict");
      const startAt = new Date(parsed.data.startAt).toISOString();
      const endAt = new Date(Date.parse(startAt) + (Date.parse(row.endAt) - Date.parse(row.startAt))).toISOString();
      if (Date.parse(startAt) <= now().getTime()) return fail("validation");
      if (startAt === row.startAt || overlapsActiveBooking(records.values(), row.providerId, startAt, endAt, row.id)) return fail("conflict");
      // A new time needs the provider to accept again; the booking goes back to REQUESTED.
      row.startAt = startAt; row.endAt = endAt; row.status = "REQUESTED"; row.doctorOperationalStatus = null; row.version++; append(row, actorRole);
      if (store) {
        store.respondAt.set(row.id, now().getTime() + syntheticResponseDelayMs(store));
        const pay = store.payments.get(row.id);
        if (pay && pay.collectedPaise === 0) store.payments.set(row.id, { ...pay, status: "NOT_INITIATED", amountDuePaise: row.priceSnapshot.amountPaise, version: pay.version + 1 });
      }
      return ok({ version: row.version });
    },
    async timeline(id) { guard(); sync(); if (!z.uuid().safeParse(id).success) return fail("validation"); return records.has(id.toLowerCase()) ? ok({ items: structuredClone(events.get(id.toLowerCase()) ?? []) }) : fail("not_found"); },
  };
}
