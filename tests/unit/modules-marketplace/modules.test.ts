import { describe, expect, it } from "vitest";
import { permittedActions } from "@/modules/bookings/actions";
import { bookingStatusSchema, doctorStatusSchema } from "@/modules/bookings/schemas";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import { createProvidersFixtureApi } from "@/modules/providers/fixture";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { serviceStepSchema, detailsStepSchema, patientStepSchema, paymentPolicyStepSchema } from "@/modules/bookings/wizard";

const fixtureEnv = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
describe("marketplace modules", () => {
  it.each(["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const)("denies wrong actors for %s", role => {
    const actions = permittedActions({ status: "REQUESTED", category: "doctor", serverAllowedActions: ["accept", "decline"] }, role);
    expect(actions.find(a => a.action === "accept")?.enabled).toBe(role === "doctor");
  });
  it("fails closed without server grants and checks state", () => {
    expect(permittedActions({ status: "REQUESTED", category: "doctor" }, "doctor").every(a => !a.enabled)).toBe(true);
    expect(permittedActions({ status: "COMPLETED", category: "doctor", serverAllowedActions: ["accept", "cancel"] }, "doctor").every(a => !a.enabled)).toBe(true);
    expect(permittedActions({ status: "UNKNOWN", category: "doctor", serverAllowedActions: ["accept"] }, "doctor").every(a => !a.enabled)).toBe(true);
  });
  it("has a presentation for every booking state and unknown fails safely", () => {
    for (const status of [...bookingStatusSchema.options, ...doctorStatusSchema.options]) {
      expect(bookingStatusPresentation(status).labelKey).toBeTruthy();
      expect(bookingStatusPresentation(status).labelKey).not.toBe("booking.status.unknown");
    }
    expect(bookingStatusPresentation("future_state")).toEqual({ labelKey: "booking.status.unknown", tone: "neutral" });
  });
  it("refuses fixture creation in production and after environment changes", async () => {
    expect(() => createProvidersFixtureApi({ env: { ...fixtureEnv, APP_ENV: "production" } })).toThrow();
    const env = { ...fixtureEnv };
    const api = createProvidersFixtureApi({ env });
    env.APP_ENV = "production";
    await expect(api.list({ category: "doctor", pin: "500001" })).rejects.toThrow();
  });
  it.each(["empty", "pending", "suspended"] as const)("never lists %s providers", async scenario => {
    const api = createProvidersFixtureApi({ env: fixtureEnv, scenario });
    expect(await api.list({ category: "doctor", pin: "500001" })).toEqual({ ok: true, data: { items: [], nextCursor: null, synthetic: true } });
  });
  it("returns explicitly synthetic data and denies uncovered PINs", async () => {
    const api = createProvidersFixtureApi({ env: fixtureEnv });
    const result = await api.list({ category: "doctor", pin: "500001" });
    expect(result.ok && result.data.items[0]?.synthetic).toBe(true);
    const empty = await api.list({ category: "doctor", pin: "500002" });
    expect(empty.ok && empty.data.items).toEqual([]);
  });
  it("does not allow clinical/emergency payloads or incomplete questionnaire", () => {
    expect(serviceStepSchema.safeParse({ providerId: "not-id", serviceId: "not-id", category: "doctor" }).success).toBe(false);
    expect(patientStepSchema.safeParse({ patientId: "00000000-0000-4000-8000-000000000001", questionnaireComplete: false }).success).toBe(false);
    expect(detailsStepSchema.safeParse({ category: "ambulance", mode: "emergency", passengers: 1 }).success).toBe(false);
    expect(detailsStepSchema.safeParse({ category: "caretaker", scope: "clinical", tasks: ["prescribe"] }).success).toBe(false);
    expect(paymentPolicyStepSchema.safeParse({ method: "pay_after", accepted: true }).success).toBe(false);
  });
  it("supports idempotent booking retry and rejects stale decisions", async () => {
    const api = createBookingsFixtureApi({ env: fixtureEnv });
    const input = { patientId: "00000000-0000-4000-8000-000000000001", serviceId: "00000000-0000-4000-8001-000000000001", addressId: "00000000-0000-4000-8000-000000000021", startAt: "2026-11-20T04:30:00Z" };
    const key = "00000000-0000-4000-8000-000000000031";
    const first = await api.create(input, key);
    expect(await api.create(input, key)).toEqual(first);
    if (!first.ok) throw new Error("Expected fixture booking");
    const id = first.data.id;
    const accepted = await api.accept(id, { expectedVersion: 2, resourceIds: ["00000000-0000-4000-8000-000000000041"] });
    expect(accepted).toEqual({ ok: true, data: { version: 4 } });
    expect(await api.decline(id, { expectedVersion: 1, reason: "provider_unavailable" })).toEqual({ ok: false, error: { code: "conflict" } });
  });
});
