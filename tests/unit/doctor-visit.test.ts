import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { POST as enRoute } from "@/app/api/bookings/[id]/en-route/route";
import { POST as arrive } from "@/app/api/bookings/[id]/arrive/route";
import { POST as start } from "@/app/api/bookings/[id]/start/route";
import { POST as complete } from "@/app/api/bookings/[id]/complete/route";
import { POST as absence } from "@/app/api/bookings/[id]/absence/route";
import { POST as interrupt } from "@/app/api/bookings/[id]/interrupt/route";
import { POST as arrivalCode } from "@/app/api/bookings/[id]/arrival-code/route";
import { POST as verifyArrival } from "@/app/api/bookings/[id]/verify-arrival/route";
import { interruptSchema, verifyArrivalSchema } from "@/lib/validation/booking";

const id = "10000000-0000-4000-8000-000000000001";
const key = "20000000-0000-4000-8000-000000000002";
const ctx = { params: Promise.resolve({ id }) };
const post = (body?: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request(`http://localhost/api/bookings/${id}/x`, body === undefined ? { method: "POST", headers } : { method: "POST", headers, body: JSON.stringify(body) });
const forged = ["substate", "state", "category", "providerId", "actorId", "amountPaise", "lat", "lng", "eta"];
const keyed = [
  ["en-route", enRoute, { expectedVersion: 4 }], ["arrive", arrive, { expectedVersion: 4 }], ["start", start, { expectedVersion: 4 }],
  ["complete", complete, { expectedVersion: 4 }], ["absence", absence, { expectedVersion: 4 }],
  ["interrupt", interrupt, { expectedVersion: 4, reason: "doctor_unable" }], ["verify-arrival", verifyArrival, { expectedVersion: 4, code: "012345" }],
] as const;

beforeEach(() => {
  mock.rpc.mockReset();
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
});

describe("doctor visit schemas", () => {
  it("reject forged keys and accept only the documented fields", () => {
    expect(interruptSchema.safeParse({ expectedVersion: 4, reason: "doctor_unable" }).success).toBe(true);
    expect(verifyArrivalSchema.safeParse({ expectedVersion: 6, code: "012345" }).success).toBe(true);
    for (const field of forged) {
      expect(interruptSchema.safeParse({ expectedVersion: 4, reason: "doctor_unable", [field]: "x" }).success).toBe(false);
      expect(verifyArrivalSchema.safeParse({ expectedVersion: 6, code: "012345", [field]: "x" }).success).toBe(false);
    }
  });
  it("keep the reason list closed and the code exactly six digits", () => {
    for (const reason of ["clinical notes", "no_show", "other", "", "ENDED_FOR_EMERGENCY", "ops_closeout", "absence_disputed"])
      expect(interruptSchema.safeParse({ expectedVersion: 4, reason }).success).toBe(false);
    for (const code of ["12345", "1234567", "12a456", " 123456", 123456]) expect(verifyArrivalSchema.safeParse({ expectedVersion: 6, code }).success).toBe(false);
    for (const expectedVersion of [0, -1, 1.5, "4"]) expect(interruptSchema.safeParse({ expectedVersion, reason: "doctor_unable" }).success).toBe(false);
  });
});

describe("doctor visit routes", () => {
  it.each([
    ["en-route", enRoute, "en_route"], ["arrive", arrive, "arrived"], ["start", start, "service_started"], ["complete", complete, "service_completed"],
  ] as const)("%s sends the route's substate and the request key, never a substate from the body", async (_name, handler, substate) => {
    mock.rpc.mockResolvedValue({ data: 5, error: null });
    const res = await handler(post({ expectedVersion: 4 }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 5 });
    expect(mock.rpc).toHaveBeenCalledWith("advance_visit", { p_booking_id: id, p_substate: substate, p_expected_version: 4, p_request_key: key });
    expect((await handler(post({ expectedVersion: 4, substate: "service_completed" }), ctx)).status).toBe(422);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("absence and interrupt pass only the documented arguments", async () => {
    mock.rpc.mockResolvedValue({ data: 7, error: null });
    expect((await absence(post({ expectedVersion: 6 }), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenLastCalledWith("report_patient_absent", { p_booking_id: id, p_expected_version: 6, p_request_key: key });
    expect((await interrupt(post({ expectedVersion: 6, reason: "ended_for_emergency" }), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenLastCalledWith("interrupt_doctor_visit", { p_booking_id: id, p_expected_version: 6, p_reason: "ended_for_emergency", p_request_key: key });
    expect((await interrupt(post({ expectedVersion: 6, reason: "ended_for_emergency", eta: "5 min" }), ctx)).status).toBe(422);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });
  it.each(keyed)("%s requires a UUID Idempotency-Key before any database call", async (_name, handler, body) => {
    for (const headers of [{}, { "Idempotency-Key": "not-a-uuid" }] as Record<string, string>[]) {
      const res = await handler(post(body, headers), ctx);
      expect(res.status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(keyed)("%s answers 503 feature_unavailable for both database gate refusals", async (_name, handler, body) => {
    for (const message of ["feature_unavailable", "feature_suspended"]) {
      mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message } });
      const res = await handler(post(body), ctx);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
    }
  });
  it("arrival-code returns the code once with no-store and takes no input", async () => {
    mock.rpc.mockResolvedValue({ data: { code: "012345", expires_at: "2027-01-01T04:05:00Z" }, error: null });
    const res = await arrivalCode(post(undefined, {}), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ code: "012345", expiresAt: "2027-01-01T04:05:00Z" });
    expect(mock.rpc).toHaveBeenCalledWith("issue_arrival_code", { p_booking_id: id });
  });
  it("verify-arrival returns the version on success and 422 with attempts left on a wrong code", async () => {
    mock.rpc.mockResolvedValueOnce({ data: { verified: true, version: 7 }, error: null });
    const ok = await verifyArrival(post({ expectedVersion: 6, code: "012345" }), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 7 });
    expect(mock.rpc).toHaveBeenCalledWith("verify_arrival_code", { p_booking_id: id, p_code: "012345", p_expected_version: 6, p_request_key: key });
    mock.rpc.mockResolvedValueOnce({ data: { verified: false, attempts_remaining: 3 }, error: null });
    const bad = await verifyArrival(post({ expectedVersion: 6, code: "999999" }), ctx);
    expect(bad.status).toBe(422);
    const body = await bad.json();
    expect(body).toEqual({ error: { code: "arrival_code_invalid" }, attemptsRemaining: 3 });
    expect(JSON.stringify(body)).not.toContain("999999");
  });
  it.each([["53300", 429], ["55000", 409], ["42501", 403], ["40001", 409], ["22023", 422], ["P0002", 404], ["XX000", 503]])
  ("maps %s to %i without the database message", async (code, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code, message: "arrival_code_limit private detail" } });
    const res = await arrivalCode(post(undefined, {}), ctx);
    expect(res.status).toBe(status);
    expect(JSON.stringify(await res.json())).not.toContain("private detail");
  });
  it("doctor routes have no environment flag: they reach the database with every FEATURE_* unset", async () => {
    vi.stubEnv("FEATURE_DOCTOR_VISITS", "");
    try {
      mock.rpc.mockResolvedValue({ data: 5, error: null });
      for (const [, handler, body] of keyed) expect((await handler(post(body), ctx)).status).not.toBe(404);
      expect(mock.rpc).toHaveBeenCalledTimes(keyed.length);
    } finally { vi.unstubAllEnvs(); }
  });
});
