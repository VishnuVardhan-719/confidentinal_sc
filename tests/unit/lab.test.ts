import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), publicRpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
vi.mock("@/lib/db/request-client", async original => ({ ...await original<typeof import("@/lib/db/request-client")>(),
  publicAuthClient: () => ({ rpc: mock.publicRpc }) }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: async () => {} }));
import { isEnabled } from "@/lib/feature-flags";
import { GET as publicTest } from "@/app/api/lab/tests/[serviceId]/route";
import { GET as availability } from "@/app/api/lab/availability/route";
import { POST as createLab } from "@/app/api/lab/bookings/route";
import { GET as order } from "@/app/api/bookings/[id]/lab/route";
import { POST as accept } from "@/app/api/bookings/[id]/lab/accept/route";
import { POST as startCollection } from "@/app/api/bookings/[id]/lab/start-collection/route";
import { POST as absence } from "@/app/api/bookings/[id]/lab/absence/route";
import { POST as collected } from "@/app/api/bookings/[id]/lab/collected/route";
import { POST as handoff } from "@/app/api/bookings/[id]/lab/handoff/route";
import { POST as collectionFailed } from "@/app/api/bookings/[id]/lab/collection-failed/route";
import { POST as handoffFailed } from "@/app/api/bookings/[id]/lab/handoff-failed/route";
import { POST as followup } from "@/app/api/bookings/[id]/lab/followup/route";
import { GET as followups } from "@/app/api/provider/lab/followups/route";
import { PUT as labTest } from "@/app/api/provider/services/[id]/lab-test/route";

const id = "10000000-0000-4000-8000-000000000001";
const key = "30000000-0000-4000-8000-000000000003";
const actor = "40000000-0000-4000-8000-000000000004";
const ctx = { params: Promise.resolve({ id, serviceId: id }) };
type Handler = (request: Request, context: typeof ctx) => Promise<Response>;
const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request("http://localhost/api/lab", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (search = "") => new Request("http://localhost/api/lab" + search);
const booking = { patientId: id, serviceId: id, addressId: id, startAt: "2027-01-01T04:30:00Z", preparationAcknowledged: true };
const test = { sampleType: "venous_blood", containerCodes: ["edta", "serum"], fastingHours: 8, preparationCode: "fasting", expectedVersion: 0 };

const steps = [
  ["start_collection", startCollection, { expectedVersion: 4 }, null],
  ["report_absence", absence, { expectedVersion: 4 }, null],
  ["collected", collected, { expectedVersion: 4 }, null],
  ["handed_over", handoff, { expectedVersion: 4 }, null],
  ["collection_failed", collectionFailed, { expectedVersion: 4, failureCode: "patient_declined" }, "patient_declined"],
  ["handoff_failed", handoffFailed, { expectedVersion: 4, failureCode: "sample_lost" }, "sample_lost"],
] as const;
// Mutations: handler, valid body. All need an Idempotency-Key.
const mutations: [string, Handler, unknown][] = [
  ["create", (r) => createLab(r), booking], ["accept", accept, { expectedVersion: 2, resourceId: id }],
  ...steps.map(([name, handler, body]) => [name, handler, body] as [string, Handler, unknown]),
  ["followup", followup, { code: "patient_contacted" }], ["lab-test", labTest, test],
];

beforeEach(() => {
  vi.stubEnv("FEATURE_LAB", "true");
  mock.rpc.mockReset().mockResolvedValue({ data: 5, error: null });
  mock.publicRpc.mockReset().mockResolvedValue({ data: { sample_type: "urine", fasting_hours: 0, preparation_code: "none" }, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc }, actor: { userId: actor } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("FEATURE_LAB gates admission routes only (contract 10.1)", () => {
  it("is enabled only by the exact string true", () => {
    expect(isEnabled("lab", {})).toBe(false);
    expect(isEnabled("lab", { FEATURE_LAB: "1" })).toBe(false);
    expect(isEnabled("lab", { FEATURE_LAB: "TRUE" })).toBe(false);
    expect(isEnabled("lab", { FEATURE_LAB: "true" })).toBe(true);
  });
  const admission: [string, () => Promise<Response>][] = [
    ["public test", () => publicTest(get(), ctx)], ["availability", () => availability(get(`?service=${id}&date=2027-01-01`))],
    ["create", () => createLab(post(booking))], ["accept", () => accept(post({ expectedVersion: 2, resourceId: id }), ctx)],
  ];
  it.each(admission)("%s returns 503 without auth, body or RPC when the flag is off", async (_name, run) => {
    vi.stubEnv("FEATURE_LAB", "false");
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
    expect(mock.session).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.publicRpc).not.toHaveBeenCalled();
  });
  it.each(steps)("%s still reaches its RPC with the flag off (closeout and start are database-gated)", async (_step, handler, body) => {
    vi.stubEnv("FEATURE_LAB", "");
    expect((await handler(post(body), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("follow-up close, reads and configuration still reach their RPCs with the flag off", async () => {
    vi.stubEnv("FEATURE_LAB", "false");
    mock.rpc.mockResolvedValue({ data: [], error: null });
    expect((await followup(post({ code: "patient_contacted" }), ctx)).status).toBe(200);
    expect((await order(get(), ctx)).status).toBe(200);
    expect((await followups(get(`?providerId=${id}`))).status).toBe(200);
    expect((await labTest(post(test), ctx)).status).toBe(200);
    expect(mock.rpc.mock.calls.map(c => c[0])).toEqual(["lab_close_followup", "get_lab_order", "list_lab_followups", "set_lab_test"]);
  });
});

describe("lab routes bind one fixed RPC each", () => {
  it.each(steps)("%s calls advance_lab_order with that step", async (step, handler, body, failure) => {
    const response = await handler(post(body), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 5 });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("advance_lab_order",
      { p_booking_id: id, p_step: step, p_expected_version: 4, p_failure_code: failure, p_request_key: key });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("create maps to create_lab_booking_request and returns 201", async () => {
    mock.rpc.mockResolvedValue({ data: id, error: null });
    const response = await createLab(post(booking));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("create_lab_booking_request", { p_patient_id: id, p_service_id: id,
      p_address_id: id, p_start_at: booking.startAt, p_preparation_acknowledged: true, p_request_key: key });
  });
  it("accept maps to accept_lab_booking with one resource", async () => {
    await accept(post({ expectedVersion: 2, resourceId: id }), ctx);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("accept_lab_booking", { p_booking_id: id, p_expected_version: 2, p_resource_id: id, p_request_key: key });
  });
  it("follow-up, lab test, order, follow-up list and slots map their arguments", async () => {
    await followup(post({ code: "escalated_to_platform" }), ctx);
    await labTest(post(test), ctx);
    await order(get(), ctx);
    await followups(get(`?providerId=${id}&limit=5&cursor=${id}`));
    await availability(get(`?service=${id}&date=2027-01-01`));
    expect(mock.rpc.mock.calls).toEqual([
      ["lab_close_followup", { p_booking_id: id, p_code: "escalated_to_platform", p_request_key: key }],
      ["set_lab_test", { p_service_id: id, p_sample_type: "venous_blood", p_container_codes: ["edta", "serum"], p_fasting_hours: 8,
        p_preparation_code: "fasting", p_expected_version: 0, p_request_key: key }],
      ["get_lab_order", { p_booking_id: id }],
      ["list_lab_followups", { p_provider_id: id, p_limit: 5, p_after: id }],
      ["list_lab_slots", { p_service_id: id, p_date: "2027-01-01" }],
    ]);
  });
  it("the public test read uses the anonymous client and 404s on null", async () => {
    const response = await publicTest(get(), ctx);
    expect(await response.json()).toEqual({ test: { sample_type: "urine", fasting_hours: 0, preparation_code: "none" } });
    expect(mock.publicRpc).toHaveBeenCalledExactlyOnceWith("get_lab_test_public", { p_service_id: id });
    expect(mock.session).not.toHaveBeenCalled();
    mock.publicRpc.mockResolvedValue({ data: null, error: null });
    expect((await publicTest(get(), ctx)).status).toBe(404);
  });
});

describe("lab input validation", () => {
  it.each(mutations)("%s requires a UUID Idempotency-Key before the RPC", async (_name, handler, body) => {
    for (const headers of [{}, { "Idempotency-Key": "forged" }] as Record<string, string>[]) {
      expect((await handler(post(body, headers), ctx)).status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["amountPaise", "price", "state", "category", "providerId", "technicianId", "resourceId", "lat", "lng", "file", "result", "note"])(
    "create rejects injected %s", async field => {
      expect((await createLab(post({ ...booking, [field]: "forged" }))).status).toBe(422);
      expect(mock.rpc).not.toHaveBeenCalled();
    });
  it.each([
    ["non-UTC startAt", { ...booking, startAt: "2027-01-01T10:00:00+05:30" }],
    ["missing acknowledgement", { patientId: id, serviceId: id, addressId: id, startAt: booking.startAt }],
    ["string acknowledgement", { ...booking, preparationAcknowledged: "true" }],
  ])("create rejects %s", async (_name, body) => {
    expect((await createLab(post(body))).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(steps)("%s rejects expectedVersion 0 and extra fields", async (_step, handler, body) => {
    expect((await handler(post({ ...body, expectedVersion: 0 }), ctx)).status).toBe(422);
    expect((await handler(post({ ...body, note: "free text" }), ctx)).status).toBe(422);
    expect((await handler(post({ ...body, state: "completed" }), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("failure codes are stage-specific and required", async () => {
    expect((await collectionFailed(post({ expectedVersion: 4, failureCode: "sample_lost" }), ctx)).status).toBe(422);
    expect((await handoffFailed(post({ expectedVersion: 4, failureCode: "patient_declined" }), ctx)).status).toBe(422);
    expect((await collectionFailed(post({ expectedVersion: 4 }), ctx)).status).toBe(422);
    expect((await collected(post({ expectedVersion: 4, failureCode: "sample_lost" }), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["no container", { ...test, containerCodes: [] }],
    ["seven containers", { ...test, containerCodes: ["edta", "serum", "fluoride", "citrate", "heparin", "urine_cup", "stool_cup"] }],
    ["duplicate containers", { ...test, containerCodes: ["edta", "edta"] }],
    ["unknown container", { ...test, containerCodes: ["jar"] }],
    ["fasting without hours", { ...test, fastingHours: 0 }],
    ["hours without fasting", { ...test, preparationCode: "none" }],
    ["17 hours", { ...test, fastingHours: 17 }],
    ["free-text instructions", { ...test, instructions: "drink water" }],
  ])("lab test rejects %s", async (_name, body) => {
    expect((await labTest(post(body), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a non-UUID booking id, unknown follow-up codes and page limits above 50", async () => {
    expect((await handoff(post({ expectedVersion: 4 }), { params: Promise.resolve({ id: "x", serviceId: id }) })).status).toBe(422);
    expect((await followup(post({ code: "called" }), ctx)).status).toBe(422);
    expect((await followups(get(`?providerId=${id}&limit=51`))).status).toBe(422);
    expect((await availability(get(`?service=${id}&date=2027-01-01&provider=SCV-LAB-000001`))).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("lab status mapping", () => {
  it.each(["feature_unavailable", "feature_suspended"])("a database gate %s is 503 feature_unavailable", async message => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
    const response = await startCollection(post({ expectedVersion: 4 }), ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
  });
  it.each([["55000", "resource_busy", 409], ["23P01", "conflicting key value", 409], ["40001", "stale_version", 409],
    ["22023", "preparation_ack_required", 422], ["53300", "pending_booking_limit", 429], ["P0002", "booking row missing", 404]] as const)(
    "%s (%s) maps to %i without leaking the message", async (code, message, status) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mock.rpc.mockResolvedValue({ data: null, error: { code, message } });
      const response = await accept(post({ expectedVersion: 2, resourceId: id }), ctx);
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain(message);
    });
  it("retries a deadlock twice, then 409", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "40P01", message: "deadlock detected" } });
    expect((await handoff(post({ expectedVersion: 4 }), ctx)).status).toBe(409);
    expect(mock.rpc).toHaveBeenCalledTimes(3);
  });
  it("logs one denial line with ids and the code only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect((await handoff(post({ expectedVersion: 4 }), ctx)).status).toBe(403);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({ event: "lab.denied", route: "lab.handed_over", actor, booking: id, code: "forbidden" });
  });
});
