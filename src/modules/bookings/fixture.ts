import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
import { categorySchema } from "@/modules/catalog/schemas";
import { syntheticBooking } from "@/fixtures/marketplace/bookings";
import { acceptSchema, bookingListSchema, createBookingSchema, decisionSchema, type Booking, type BookingEvent, type BookingStatus } from "./schemas";
import type { BookingsApi } from "./api";
export function createBookingsFixtureApi(options: { env?: FixtureEnvironment; scenario?: "empty" | "stale_slot" | "requested" | "accepted" | "declined" | "cancelled" } = {}): BookingsApi {
  const guard = fixtureGuard(options.env);
  const records = new Map<string, Booking>();
  const events = new Map<string, BookingEvent[]>();
  const intents = new Map<string, { body: string; id: string }>();
  if (options.scenario && !["empty", "stale_slot"].includes(options.scenario)) {
    const row = syntheticBooking("00000000-0000-4000-8000-000000000061");
    const statuses: Record<string, BookingStatus> = { requested: "REQUESTED", accepted: "ACCEPTED", declined: "DECLINED", cancelled: "CANCELLED" };
    row.status = statuses[options.scenario]; records.set(row.id, row);
  }
  function append(row: Booking, actorRole: BookingEvent["actorRole"]) {
    events.set(row.id, [...events.get(row.id) ?? [], { id: crypto.randomUUID(), bookingId: row.id, status: row.status, version: row.version,
      occurredAt: new Date().toISOString(), actorRole, synthetic: true }]);
  }
  function change(id: string, input: unknown, action: "accept" | "decline" | "cancel") {
    guard();
    const parsed = (action === "accept" ? acceptSchema : decisionSchema).safeParse(input);
    if (!z.uuid().safeParse(id).success || !parsed.success) return fail("validation");
    const row = records.get(id.toLowerCase());
    if (!row) return fail("not_found");
    if (parsed.data.expectedVersion !== row.version || (action === "cancel" ? !["DRAFT", "REQUESTED", "ACCEPTED", "CONFIRMED"].includes(row.status) : row.status !== "REQUESTED")) return fail("conflict");
    if (action === "accept") {
      const count = row.category === "ambulance" ? 2 : 1;
      const resources = acceptSchema.parse(input).resourceIds;
      if (resources.length !== count) return fail("validation");
      row.status = "ACCEPTED"; row.version++; append(row, "provider");
      row.status = "CONFIRMED"; row.version++; append(row, "provider");
      row.doctorOperationalStatus = row.category === "doctor" ? "SCHEDULED" : null;
    } else {
      if (action === "decline" && decisionSchema.parse(input).reason === "patient_request") return fail("validation");
      row.status = action === "decline" ? "DECLINED" : "CANCELLED";
      row.version++; append(row, action === "cancel" ? "patient" : "provider");
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
      const provider = categorySchema.options.map(category => syntheticProvider(category)).find(item => item.serviceId === parsed.data.serviceId);
      if (!provider) return fail("not_found");
      const id = crypto.randomUUID();
      const row = syntheticBooking(id);
      row.serviceId = provider.serviceId; row.providerId = provider.id; row.category = provider.category;
      row.pin = provider.pin; row.priceSnapshot.amountPaise = provider.amountPaise;
      row.startAt = new Date(parsed.data.startAt).toISOString();
      row.endAt = new Date(Date.parse(row.startAt) + 60 * 60 * 1000).toISOString();
      records.set(id, row); intents.set(key, { body, id }); append(row, "patient");
      return ok({ id });
    },
    async list(filters = {}) {
      guard(); const parsed = bookingListSchema.safeParse(filters);
      if (!parsed.success) return fail("validation");
      return ok({ items: structuredClone([...records.values()].filter(row => (!parsed.data.providerId || row.providerId === parsed.data.providerId)
        && (!parsed.data.cursor || row.id > parsed.data.cursor)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, parsed.data.limit)) });
    },
    async get(id) { guard(); if (!z.uuid().safeParse(id).success) return fail("validation"); const row = records.get(id.toLowerCase()); return row ? ok(structuredClone(row)) : fail("not_found"); },
    async accept(id, input) { return change(id, input, "accept"); },
    async decline(id, input) { return change(id, input, "decline"); },
    async cancel(id, input) { return change(id, input, "cancel"); },
    async timeline(id) { guard(); if (!z.uuid().safeParse(id).success) return fail("validation"); return records.has(id.toLowerCase()) ? ok({ items: structuredClone(events.get(id.toLowerCase()) ?? []) }) : fail("not_found"); },
  };
}
