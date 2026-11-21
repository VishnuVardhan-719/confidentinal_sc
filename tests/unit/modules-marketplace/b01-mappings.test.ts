import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { HttpClient } from "@/lib/api/http";
import { fail, ok } from "@/lib/api/result";
import { availabilityPath, createSlotsB01HttpApi, rescheduleViaB01, slotDates } from "@/modules/bookings/b01-http";
import { saveAddressViaB01, toB01AddressBody, toB01Phone } from "@/modules/patient/b01-http";

/** R-FE-Q-C14-5: B01 shape mappings for slots, reschedule and addresses, ready to enable (adapters still gated). */
const PROVIDER = "00000000-0000-4000-8000-000000000001";
const SERVICE = "00000000-0000-4000-8001-000000000001";
const BOOKING = "00000000-0000-4000-8000-0000000000b1";
const KEY = "00000000-0000-4000-8000-0000000000c1";

function fakeHttp(respond: (path: string, options?: unknown) => unknown) {
  const calls: { path: string; options?: unknown }[] = [];
  const http: HttpClient = {
    async request<T>(path: string, schema: z.ZodType<T>, options?: unknown) {
      calls.push({ path, options });
      const body = respond(path, options);
      if (body instanceof Error) return fail("unavailable");
      const parsed = schema.safeParse(body);
      return parsed.success ? ok(parsed.data) : fail("unavailable");
    },
  };
  return { http, calls };
}

describe("B01 availability -> SlotsApi", () => {
  it("builds B01's query keys (provider, service, date)", () => {
    expect(availabilityPath({ providerId: PROVIDER, serviceId: SERVICE }, "2026-11-21"))
      .toBe(`/api/availability?provider=${PROVIDER}&service=${SERVICE}&date=2026-11-21`);
    expect(availabilityPath({ providerId: "nope", serviceId: SERVICE }, "2026-11-21")).toBeNull();
  });

  it("offers IST calendar days, starting today in India", () => {
    // 2026-11-20 20:00 UTC is already 21 November in India.
    expect(slotDates(new Date("2026-11-20T20:00:00Z"), 3)).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
  });

  it("maps snake_case slots to { startAt, endAt }, merges days and sorts", async () => {
    const { http, calls } = fakeHttp(path => ({
      slots: path.endsWith("2026-11-22")
        ? [{ start_at: "2026-11-22T04:30:00Z", end_at: "2026-11-22T05:30:00Z", advisory: true }]
        : [{ start_at: "2026-11-21T09:30:00Z", end_at: "2026-11-21T10:30:00Z", advisory: true }, { start_at: "2026-11-21T03:30:00Z", end_at: "2026-11-21T04:30:00Z", advisory: true }],
      advisory: true,
    }));
    const api = createSlotsB01HttpApi(http, { days: 2, now: () => new Date("2026-11-20T20:00:00Z") });
    const result = await api.list({ providerId: PROVIDER, serviceId: SERVICE });
    expect(calls.map(c => c.path.slice(-10))).toEqual(["2026-11-21", "2026-11-22"]);
    expect(result).toEqual(ok({ items: [
      { startAt: "2026-11-21T03:30:00.000Z", endAt: "2026-11-21T04:30:00.000Z" },
      { startAt: "2026-11-21T09:30:00.000Z", endAt: "2026-11-21T10:30:00.000Z" },
      { startAt: "2026-11-22T04:30:00.000Z", endAt: "2026-11-22T05:30:00.000Z" },
    ] }));
  });

  it("one failing day fails the whole list (no calendar that only looks complete)", async () => {
    const { http } = fakeHttp(path => (path.endsWith("2026-11-22") ? new Error("down") : { slots: [], advisory: true }));
    expect(await createSlotsB01HttpApi(http, { days: 2, now: () => new Date("2026-11-20T20:00:00Z") }).list({ providerId: PROVIDER, serviceId: SERVICE }))
      .toEqual(fail("unavailable"));
  });

  it("refuses a response without B01's advisory marker", async () => {
    const { http } = fakeHttp(() => ({ slots: [] }));
    expect((await createSlotsB01HttpApi(http, { days: 1 }).list({ providerId: PROVIDER, serviceId: SERVICE })).ok).toBe(false);
  });
});

describe("B01 reschedule", () => {
  it("posts { expectedVersion, startAt } with the idempotency key and returns B01's id", async () => {
    const { http, calls } = fakeHttp(() => ({ id: "00000000-0000-4000-8000-0000000000d1" }));
    const result = await rescheduleViaB01(http, BOOKING, { expectedVersion: 3, startAt: "2026-11-22T04:30:00Z" }, KEY);
    expect(result).toEqual(ok({ id: "00000000-0000-4000-8000-0000000000d1" }));
    expect(calls[0]).toEqual({ path: `/api/bookings/${BOOKING}/reschedule`, options: { method: "POST", body: { expectedVersion: 3, startAt: "2026-11-22T04:30:00Z" }, idempotencyKey: KEY } });
  });

  it("validates before sending", async () => {
    const send = vi.fn();
    const http = { request: send } as unknown as HttpClient;
    expect(await rescheduleViaB01(http, BOOKING, { expectedVersion: 3, startAt: "2026-11-22T04:30:00Z" }, "not-a-uuid")).toEqual(fail("validation"));
    expect(await rescheduleViaB01(http, "x", { expectedVersion: 3, startAt: "2026-11-22T04:30:00Z" }, KEY)).toEqual(fail("validation"));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("B01 address body", () => {
  const form = { label: "home", locality: "Synthetic locality A", city: "Hyderabad", pin: "500032", line1: "Synthetic house 1", contactName: "Synthetic contact", phone: "98765 43210" } as const;

  it("normalises Indian mobiles to B01's +91 form", () => {
    expect(toB01Phone("98765 43210")).toBe("+919876543210");
    expect(toB01Phone("+91-9876543210")).toBe("+919876543210");
    expect(toB01Phone("09876543210")).toBe("+919876543210");
    expect(toB01Phone("12345 67890")).toBeNull();
  });

  it("maps the form to B01's body and drops label and city (no B01 column)", () => {
    expect(toB01AddressBody(PROVIDER, form)).toEqual({ patientId: PROVIDER, line1: "Synthetic house 1", locality: "Synthetic locality A", pin: "500032", contactName: "Synthetic contact", phone: "+919876543210", expectedVersion: 0 });
  });

  it("refuses the current form shape, which lacks line1, contact name and phone", () => {
    expect(toB01AddressBody(PROVIDER, { label: "home", locality: "Synthetic locality A", city: "Hyderabad", pin: "500032" })).toBeNull();
  });

  it("saves through POST /api/patient/addresses and validates first", async () => {
    const { http, calls } = fakeHttp(() => ({ id: "00000000-0000-4000-8000-0000000000e1" }));
    expect((await saveAddressViaB01(http, PROVIDER, form)).ok).toBe(true);
    expect(calls[0].path).toBe("/api/patient/addresses");
    expect(await saveAddressViaB01(http, PROVIDER, { ...form, phone: "123" })).toEqual(fail("validation"));
    expect(calls).toHaveLength(1);
  });
});
