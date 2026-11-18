import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "@/lib/api/http";
import { createProvidersHttpApi } from "@/modules/providers/http";
import { createBookingsHttpApi } from "@/modules/bookings/http";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { createPaymentsFixtureApi } from "@/modules/payments/fixture";
import { createSupportFixtureApi } from "@/modules/support/fixture";
import { createNotificationsFixtureApi } from "@/modules/notifications/fixture";
import { createProvidersFixtureApi } from "@/modules/providers/fixture";
import { syntheticProvider } from "@/fixtures/marketplace/providers";
import { createPaymentsHttpApi } from "@/modules/payments/http";
import { createSupportHttpApi } from "@/modules/support/http";
import { createNotificationsHttpApi } from "@/modules/notifications/http";
import { collectionRecordSchema } from "@/modules/payments/schemas";
import { optimisticMarkRead, rollbackMarkRead } from "@/modules/notifications/schemas";
import { syntheticNotification } from "@/fixtures/marketplace/notifications";
import { permittedActions } from "@/modules/bookings/actions";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const id = "00000000-0000-4000-8000-000000000001";
const resource = "00000000-0000-4000-8000-000000000041";
const rawProvider = { provider_id: id, category: "doctor", display_name: "Synthetic doctor", service_id: id,
  service_title: "Synthetic visit", duration_minutes: 60, amount_paise: "12345", currency: "INR", unit: "visit", terms_version: "synthetic", pin_code: "500001", city: "Synthetic", advisory_availability: null };
const rawBooking = { id, public_ref: null, provider_id: id, category: "doctor", service_id: id, pin_code: "500001",
  start_at: "2026-11-20T04:30:00+00:00", end_at: "2026-11-20T05:30:00+00:00", state: "requested", version: 2,
  amount_paise: "12345", currency: "INR", terms_version: "synthetic", policy_version_id: id,
  patient_id: id, address_snapshot: { line1: "private" }, contact_snapshot: { phone: "private" } };

describe("verified HTTP contracts", () => {
  it("uses C01 catalog routes, numeric paise and a private-field allowlist", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ results: [{ ...rawProvider, phone: "private", address: "private" }], nextCursor: null }));
    const api = createProvidersHttpApi(createHttpClient({ fetch }));
    const result = await api.list({ category: "doctor", pin: "500001" });
    expect(result.ok && result.data.items[0]).toEqual(expect.objectContaining({ amountPaise: 12345, synthetic: false }));
    expect(JSON.stringify(result)).not.toContain("private");
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/catalog?category=doctor&pin=500001&limit=20");
    await api.get(id, { category: "doctor", pin: "500001" });
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/catalog/" + id + "?category=doctor&pin=500001");
    expect(await api.list({ category: "doctor", pin: "500001", sort: "price_desc" })).toEqual({ ok: false, error: { code: "gated" } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid wire paise rather than rounding or coercing", async () => {
    for (const amount of ["1.5", "10000000001", "9007199254740993", "-1", 100]) {
      const http = createHttpClient({ fetch: async () => Response.json({ results: [{ ...rawProvider, amount_paise: amount }], nextCursor: null }) });
      expect(await createProvidersHttpApi(http).list({ category: "doctor", pin: "500001" })).toEqual({ ok: false, error: { code: "unavailable" } });
    }
  });
  it("parses B01 lifecycle without treating service_started as clinical verification", async () => {
    const http = createHttpClient({ fetch: async () => Response.json({ booking: { ...rawBooking, substate: "service_started" } }) });
    const result = await createBookingsHttpApi(http).get(id);
    expect(result.ok && result.data).toEqual(expect.objectContaining({ status: "REQUESTED", doctorOperationalStatus: "SERVICE_STARTED", version: 2 }));
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.ok && result.data).not.toHaveProperty("clinicalStatus");
  });
  it("rejects unknown backend statuses", async () => {
    const api = createBookingsHttpApi(createHttpClient({ fetch: async () => Response.json({ booking: { ...rawBooking, state: "future_status" } }) }));
    expect(await api.get(id)).toEqual({ ok: false, error: { code: "unavailable" } });
  });
  it("sends B01 create payload and stable key once per retry without price/role/status fields", async () => {
    const fetch = vi.fn(async () => Response.json({ id }));
    const api = createBookingsHttpApi(createHttpClient({ fetch }));
    const input = { patientId: id, serviceId: id, addressId: id, startAt: "2026-11-20T04:30:00Z" };
    expect(await api.create(input, id)).toEqual({ ok: true, data: { id } });
    expect(await api.create(input, id)).toEqual({ ok: true, data: { id } });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[0]).toBe("/api/bookings");
      expect(new Headers(call[1].headers).get("Idempotency-Key")).toBe(id);
      expect(JSON.parse(String(call[1].body))).toEqual(input);
    }
  });
  it("returns 409 without blind retry and can refetch latest version", async () => {
    const fetch = vi.fn(async (_path: string | URL | Request, init?: RequestInit) => init?.method === "POST" ? new Response("stale internal detail", { status: 409 }) : Response.json({ booking: rawBooking }));
    const api = createBookingsHttpApi(createHttpClient({ fetch }));
    expect(await api.accept(id, { expectedVersion: 1, resourceIds: [resource] })).toEqual({ ok: false, error: { code: "conflict" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const current = await api.get(id); expect(current.ok && current.data.version).toBe(2);
    expect(await api.timeline(id)).toEqual({ ok: false, error: { code: "gated" } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects non-API path traversal without sending a request", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const http = createHttpClient({ fetch });
    for (const path of ["/api/../admin", "/api/%2e%2e/admin", "/api/%2f%2foutside.invalid", "/api/./bookings"]) {
      expect(await http.request(path, z.object({}))).toEqual({ ok: false, error: { code: "validation" } });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps all unimplemented adapters gated without fetch", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
    try {
      const payments = createPaymentsHttpApi(); const support = createSupportHttpApi(); const notifications = createNotificationsHttpApi();
      for (const result of [await payments.getSummary(id), await support.list(), await support.get(id), await notifications.list(), await notifications.markRead(id, { expectedVersion: 1 })])
        expect(result).toEqual({ ok: false, error: { code: "gated" } });
      expect(fetch).not.toHaveBeenCalled();
      expect(collectionRecordSchema.safeParse({ bookingId: id, amountPaise: 500, method: "card", cardNumber: "synthetic", expectedVersion: 1, collectedAt: "2026-11-18T00:00:00Z" }).success).toBe(false);
    } finally { fetch.mockRestore(); }
  });
});

describe("fixtures and conservative actions", () => {
  it.each(["doctor", "lab", "ambulance", "caretaker"] as const)("resolves the selected %s service and B01 transition versions", async category => {
    const provider = syntheticProvider(category);
    const api = createBookingsFixtureApi({ env });
    const created = await api.create({ patientId: id, serviceId: provider.serviceId, addressId: id, startAt: "2026-11-20T04:30:00Z" }, id);
    if (!created.ok) throw new Error("Expected fixture request");
    const requested = await api.get(created.data.id);
    expect(requested.ok && requested.data).toEqual(expect.objectContaining({ category, version: 2, status: "REQUESTED" }));
    const resources = category === "ambulance" ? [id, resource] : [resource];
    expect(await api.accept(created.data.id, { expectedVersion: 2, resourceIds: resources })).toEqual({ ok: true, data: { version: 4 } });
    const events = await api.timeline(created.data.id);
    expect(events.ok && events.data.items.map(event => event.status)).toEqual(["REQUESTED", "ACCEPTED", "CONFIRMED"]);
  });
  it("rejects the same intent key with changed data", async () => {
    const api = createBookingsFixtureApi({ env });
    const input = { patientId: id, serviceId: syntheticProvider("doctor").serviceId, addressId: id, startAt: "2026-11-20T04:30:00Z" };
    await api.create(input, id);
    expect(await api.create({ ...input, startAt: "2026-11-20T05:30:00Z" }, id)).toEqual({ ok: false, error: { code: "conflict" } });
  });
  it.each([createProvidersFixtureApi, createBookingsFixtureApi, createPaymentsFixtureApi, createSupportFixtureApi, createNotificationsFixtureApi])("checks production gate for every fixture module", factory => {
    expect(() => factory({ env: { ...env, APP_ENV: "production" } })).toThrow();
  });
  it("cannot bypass actual production by injecting a nonproduction fixture environment", () => {
    vi.stubEnv("APP_ENV", "production");
    try { expect(() => createProvidersFixtureApi({ env })).toThrow(); } finally { vi.unstubAllEnvs(); }
  });
  it("rolls notification reads back without replacing newer state", () => {
    const change = optimisticMarkRead(syntheticNotification, "2026-11-18T01:00:00Z");
    expect(rollbackMarkRead(change.after, change)).toEqual(syntheticNotification);
    const newer = { ...change.after, version: change.after.version + 1 };
    expect(rollbackMarkRead(newer, change)).toBe(newer);
  });
  it.each([
    ["DRAFT", "patient", "submit", true], ["REQUESTED", "doctor", "accept", true],
    ["REQUESTED", "doctor", "decline", true], ["CONFIRMED", "patient", "cancel", true],
    ["IN_PROGRESS", "patient", "cancel", false], ["COMPLETED", "doctor", "accept", false],
    ["REQUESTED", "admin", "accept", false], ["REQUESTED", "lab", "accept", false],
  ] as const)("%s / %s / %s => %s", (status, role, action, expected) => {
    const actions = permittedActions({ status, category: "doctor", serverAllowedActions: [action] }, role);
    expect(actions.find(item => item.action === action)?.enabled).toBe(expected);
  });
});
