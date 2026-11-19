import type { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok, type ApiErrorCode, type ApiResult } from "@/lib/api/result";
import { istDate } from "@/modules/bookings/slots";
import type { PatientApi } from "@/modules/patient/api";
import type { PatientAddress } from "@/modules/patient/schemas";
import {
  ACTIVE_STATUSES, cancelRequestSchema, cancelState, overlaps, providerFilterSchema, referenceFor, totalOf,
  type BaseProvider, type RequestEvent, type RequestLine, type RequestSlot, type ServiceCategory, type ServiceRequest, type ServiceRequestsApi,
} from "./core";

/**
 * Synthetic adapter engine shared by the lab, caretaker and ambulance request modules (fixture mode only:
 * every operation re-checks the fixture guard, so it is refused in production). Records live in one
 * process-wide in-memory store per category, so a request made in one server action is visible to the next
 * page load. Restarting the server resets it. Nothing here is a real person, provider or booking.
 *
 * Synthetic provider behaviour (documented so tests and reviewers can rely on it): the category's
 * `decliningProviderId` declines every request; every other provider accepts and the request is confirmed
 * with a server-made reference. The answer lands FIXTURE_PROVIDER_RESPONSE_MS (default 3000) after the
 * request, so the patient first sees an honest "waiting" state and has to check for updates.
 */
export type RequestInputBase = { providerId: string; patientId: string; addressId: string; startAt: string; expectedTotalPaise: number };

export type FixtureSpec<P extends BaseProvider, I extends RequestInputBase, D> = {
  category: ServiceCategory;
  providers: readonly P[];
  decliningProviderId: string;
  /** India wall-clock start times (HH:MM) offered each day. */
  slotTimes: readonly string[];
  /** Length used to offer slots (the shortest booking). */
  slotMinutes: number;
  schema: z.ZodType<I>;
  /** Length of this request in minutes. */
  durationMinutes(input: I): number;
  /** Server price snapshot, or an error code when the input does not fit the provider's catalogue. */
  price(provider: P, input: I): RequestLine[] | ApiErrorCode;
  details(provider: P, input: I): D;
  /** Extra checks against the provider (coverage of a second address and similar). */
  check?(provider: P, input: I, address: PatientAddress): ApiErrorCode | null;
};

export type RequestStore<D> = {
  records: Map<string, ServiceRequest<D>>;
  intents: Map<string, { body: string; id: string }>;
  respondAt: Map<string, number>;
};

const SLOT_DAYS = 5;
const LEAD_MS = 2 * 60 * 60_000;

/** Process-wide synthetic store for one category. */
export function requestStore<D>(category: ServiceCategory): RequestStore<D> {
  const key = Symbol.for(`surecure.synthetic-${category}-requests`);
  const holder = globalThis as unknown as Record<symbol, RequestStore<D> | undefined>;
  holder[key] ??= { records: new Map(), intents: new Map(), respondAt: new Map() };
  return holder[key];
}

function responseDelay(env: FixtureEnvironment): number {
  const raw = Number(env.FIXTURE_PROVIDER_RESPONSE_MS ?? "3000");
  return Number.isSafeInteger(raw) && raw >= 0 && raw <= 600_000 ? raw : 3000;
}

export function createServiceRequestsFixtureApi<P extends BaseProvider, I extends RequestInputBase, D>(
  spec: FixtureSpec<P, I, D>,
  options: { env?: FixtureEnvironment; patient: PatientApi; store?: RequestStore<D>; now?: () => Date },
): ServiceRequestsApi<P, D> {
  const env = options.env ?? process.env;
  const guard = fixtureGuard(env);
  const now = options.now ?? (() => new Date());
  const store = options.store ?? requestStore<D>(spec.category);
  const delay = responseDelay(env);
  const providerById = (id: string) => spec.providers.find(provider => provider.id === id.toLowerCase());

  function tick() {
    const at = now().getTime();
    for (const [id, due] of store.respondAt) {
      if (due > at) continue;
      store.respondAt.delete(id);
      const row = store.records.get(id);
      if (!row || row.status !== "REQUESTED") continue;
      const when = new Date(due).toISOString();
      const push = (event: RequestEvent) => { row.events = [...row.events, event]; row.version++; };
      if (row.providerId === spec.decliningProviderId) {
        row.status = "DECLINED"; push({ status: "DECLINED", at: when, actor: "provider" });
        row.payment = { status: "NOT_INITIATED", amountDuePaise: 0 };
        continue;
      }
      row.status = "ACCEPTED"; push({ status: "ACCEPTED", at: when, actor: "provider" });
      row.status = "CONFIRMED"; push({ status: "CONFIRMED", at: when, actor: "system" });
      row.publicReference ??= referenceFor(id);
      row.payment = { status: "DUE", amountDuePaise: row.totalPaise };
    }
  }

  const busy = (providerId: string, startAt: string, endAt: string, exceptId?: string) =>
    [...store.records.values()].some(row => row.id !== exceptId && row.providerId === providerId && ACTIVE_STATUSES.includes(row.status) && overlaps(row.startAt, row.endAt, startAt, endAt));

  function openSlots(provider: P): RequestSlot[] {
    const nowMs = now().getTime();
    const items: RequestSlot[] = [];
    for (let day = 0; day < SLOT_DAYS; day++) {
      const date = istDate(nowMs + day * 86_400_000);
      for (const time of spec.slotTimes) {
        const start = Date.parse(`${date}T${time}:00+05:30`);
        if (start < nowMs + LEAD_MS) continue;
        const slot = { startAt: new Date(start).toISOString(), endAt: new Date(start + spec.slotMinutes * 60_000).toISOString() };
        if (!busy(provider.id, slot.startAt, slot.endAt)) items.push(slot);
      }
    }
    return items;
  }

  return {
    async listProviders(filter) {
      guard();
      const parsed = providerFilterSchema.safeParse(filter ?? {});
      if (!parsed.success) return fail("validation");
      const pin = parsed.data.pin;
      return ok({ items: structuredClone(spec.providers.filter(provider => !pin || provider.area.pins.includes(pin))) as P[], synthetic: true });
    },
    async getProvider(id) {
      guard();
      const provider = providerById(id);
      return provider ? ok(structuredClone(provider) as P) : fail("not_found");
    },
    async slots(providerId) {
      guard(); tick();
      const provider = providerById(providerId);
      return provider ? ok({ items: openSlots(provider) }) : fail("not_found");
    },
    async create(input, idempotencyKey) {
      guard(); tick();
      const parsed = spec.schema.safeParse(input);
      if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return fail("validation");
      const data = parsed.data;
      const body = JSON.stringify(data);
      const prior = store.intents.get(idempotencyKey);
      if (prior) return prior.body === body ? ok({ id: prior.id }) : fail("conflict");
      const provider = providerById(data.providerId);
      if (!provider) return fail("not_found");
      const [members, addresses] = await Promise.all([options.patient.listMembers(), options.patient.listAddresses()]);
      if (!members.ok) return members;
      if (!addresses.ok) return addresses;
      const member = members.data.items.find(item => item.patientId === data.patientId);
      if (!member || (member.relation !== "self" && !member.canBook)) return fail("forbidden");
      const address = addresses.data.items.find(item => item.id === data.addressId);
      if (!address || !provider.area.pins.includes(address.pin)) return fail("validation", { fields: { addressId: "outside_area" } });
      const extra = spec.check?.(provider, data, address);
      if (extra) return fail(extra);
      const lines = spec.price(provider, data);
      if (typeof lines === "string") return fail(lines);
      const total = totalOf(lines);
      // The browser's figure only detects a change; the server's lines are what is stored.
      if (total !== data.expectedTotalPaise) return fail("conflict");
      const startMs = Date.parse(data.startAt);
      const offered = openSlots(provider).some(slot => slot.startAt === new Date(startMs).toISOString());
      const endAt = new Date(startMs + spec.durationMinutes(data) * 60_000).toISOString();
      if (!offered || busy(provider.id, data.startAt, endAt)) return fail("conflict");
      const id = crypto.randomUUID();
      const at = now().toISOString();
      const row: ServiceRequest<D> = {
        id, category: spec.category, providerId: provider.id, providerName: provider.name, patientId: member.patientId,
        address: { label: address.label, locality: address.locality, city: address.city, pin: address.pin },
        startAt: new Date(startMs).toISOString(), endAt, lines, totalPaise: total, currency: "INR", status: "REQUESTED", version: 1,
        publicReference: null, payment: { status: "NOT_INITIATED", amountDuePaise: 0 }, details: spec.details(provider, data),
        events: [{ status: "REQUESTED", at, actor: "patient" }], createdAt: at, synthetic: true,
      };
      store.records.set(id, row);
      store.intents.set(idempotencyKey, { body, id });
      store.respondAt.set(id, now().getTime() + delay);
      return ok({ id });
    },
    async get(id) {
      guard(); tick();
      const row = store.records.get(id.toLowerCase());
      return row ? ok(structuredClone(row)) : fail("not_found");
    },
    async list() {
      guard(); tick();
      return ok({ items: structuredClone([...store.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) });
    },
    async cancel(id, input) {
      guard(); tick();
      const parsed = cancelRequestSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      const row = store.records.get(id.toLowerCase());
      if (!row) return fail("not_found");
      if (row.version !== parsed.data.expectedVersion) return fail("conflict");
      if (cancelState(row, now().getTime()) !== "open") return fail("conflict");
      row.status = "CANCELLED"; row.version++;
      row.events = [...row.events, { status: "CANCELLED", at: now().toISOString(), actor: "patient" }];
      row.payment = { status: "NOT_INITIATED", amountDuePaise: 0 };
      store.respondAt.delete(row.id);
      return ok({ version: row.version });
    },
  };
}

/** HTTP adapter for a service without an agreed backend contract: validates, then fails closed. */
export function createGatedServiceRequestsApi<P extends BaseProvider, D>(schema: z.ZodType<unknown>): ServiceRequestsApi<P, D> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const gate = (valid: boolean): Promise<ApiResult<never>> => Promise.resolve(fail(valid ? "gated" : "validation"));
  return {
    listProviders: filter => gate(providerFilterSchema.safeParse(filter ?? {}).success),
    getProvider: id => gate(uuid.test(id)),
    slots: providerId => gate(uuid.test(providerId)),
    create: (input, key) => gate(schema.safeParse(input).success && uuid.test(key)),
    get: id => gate(uuid.test(id)),
    list: () => gate(true),
    cancel: (id, input) => gate(uuid.test(id) && cancelRequestSchema.safeParse(input).success),
  };
}
