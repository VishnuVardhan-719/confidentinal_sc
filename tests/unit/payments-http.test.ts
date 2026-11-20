import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: async () => {} }));
import { paymentRoute } from "@/lib/payments/http";

const id = "10000000-0000-4000-8000-000000000001";
const cid = "20000000-0000-4000-8000-000000000002";
const key = "30000000-0000-4000-8000-000000000003";
const context = { params: Promise.resolve({ id, cid }) };
const decision = { expectedPaymentVersion: 3, reasonCode: "correction" };
const commands = [
  ["report_collection", { amountPaise: "5000", method: "cash" }, { p_booking_id: id, p_amount_paise: "5000", p_method: "cash", p_reference: null, p_request_key: key }, "id"],
  ["report_collection_exception", { amountPaise: "5000", method: "upi_direct", reference: "123456789012" }, { p_booking_id: id, p_amount_paise: "5000", p_method: "upi_direct", p_reference: "123456789012", p_request_key: key }, "id"],
  ["review_collection_intake", { ...decision, decision: "convert" }, { p_intake_id: id, p_decision: "convert", p_reason_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "result"],
  ["void_collection", decision, { p_collection_id: cid, p_reason_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "result"],
  ["reconcile_collection", { ...decision, decision: "confirm" }, { p_collection_id: id, p_decision: "confirm", p_reason_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "result"],
  ["supersede_collection", { ...decision, amountPaise: "6000", method: "cash" }, { p_collection_id: id, p_amount_paise: "6000", p_method: "cash", p_reference: null, p_reason_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "id"],
  ["dispute_payment", { expectedPaymentVersion: 3, reasonCode: "already_paid" }, { p_booking_id: id, p_reason_code: "already_paid", p_expected_payment_version: 3, p_request_key: key }, "result"],
  ["resolve_dispute", { expectedPaymentVersion: 3, resolutionCode: "correction" }, { p_payment_id: id, p_resolution_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "result"],
  ["override_payment", { ...decision, targetState: "disputed" }, { p_payment_id: id, p_target_state: "disputed", p_reason_code: "correction", p_expected_payment_version: 3, p_request_key: key }, "result"],
] as const;
const reads = ["get_payment_summary", "get_collection_intake_status", "list_provider_payments", "list_payment_queue", "list_payment_exceptions"] as const;
const request = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) => new Request("http://localhost/api/payments", { method: "POST", headers, body: JSON.stringify(body) });

beforeEach(() => {
  vi.stubEnv("FEATURE_PAY_AFTER", "true");
  mock.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
});
afterEach(() => vi.unstubAllEnvs());

describe("P01a HTTP gates and commands", () => {
  it.each([...commands.map(([name]) => name), ...reads])("returns 404 for %s before authentication or body consumption", async name => {
    vi.stubEnv("FEATURE_PAY_AFTER", "false");
    const req = request({});
    const response = await paymentRoute(name)(req, context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
    expect(req.bodyUsed).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.session).not.toHaveBeenCalled();
  });
  it.each(commands)("maps %s to the exact RPC contract", async (name, body, args, responseKey) => {
    const result = responseKey === "id" ? cid : null;
    mock.rpc.mockResolvedValue({ data: result, error: null });
    const response = await paymentRoute(name)(request(body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ [responseKey]: result });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(commands)("requires a UUID idempotency key on %s", async (name, body) => {
    for (const headers of [{}, { "Idempotency-Key": "forged" }] as Record<string, string>[]) {
      expect((await paymentRoute(name)(request(body, headers), context)).status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["state", "status", "paid", "actor", "collectorId", "confirmedPaise"])("rejects injected %s", async field => {
    const response = await paymentRoute("report_collection")(request({ amountPaise: "100", method: "cash", [field]: "forged" }), context);
    expect(response.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("returns sanitized authentication and capability failures", async () => {
    mock.session.mockRejectedValueOnce(new IdentityError(401, "unauthenticated"));
    expect((await paymentRoute("get_payment_summary")(new Request("http://localhost"), context)).status).toBe(401);
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private patient data" } });
    const response = await paymentRoute("get_payment_summary")(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
  });
  it("maps over-collection to conflict without retry or success", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "over_collection" } });
    const response = await paymentRoute("report_collection")(request({ amountPaise: "100", method: "cash" }), context);
    expect(response.status).toBe(409);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("bounds JSON and validates both nested route identifiers", async () => {
    const handler = paymentRoute("void_collection");
    expect((await handler(request(decision), { params: Promise.resolve({ id: "bad", cid }) })).status).toBe(422);
    expect((await handler(request(decision), { params: Promise.resolve({ id, cid: "bad" }) })).status).toBe(422);
    expect((await handler(request({ ...decision, extra: "x".repeat(16384) }), context)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("P01a reads", () => {
  it.each([
    ["get_payment_summary", "", { p_booking_id: id }, "payment"],
    ["get_collection_intake_status", "", { p_intake_id: id }, "intake"],
    ["list_provider_payments", `?limit=10&afterId=${cid}`, { p_provider_id: id, p_limit: 10, p_after_id: cid }, "payments"],
    ["list_payment_queue", `?limit=10&afterId=${cid}&afterReportedAt=2027-01-01T00:00:00Z`, { p_limit: 10, p_after_id: cid, p_after_reported_at: "2027-01-01T00:00:00Z" }, "collections"],
    ["list_payment_exceptions", "", { p_limit: 25, p_after_id: null, p_after_reported_at: null }, "exceptions"],
  ] as const)("maps %s and returns private responses", async (name, q, args, field) => {
    const response = await paymentRoute(name)(new Request(`http://localhost/api/payments${q}`), context);
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
    expect(await response.json()).toEqual({ [field]: null });
  });
  it.each(["?limit=101", "?limit=0", "?limit=1&limit=2", "?state=paid", `?afterId=${id}`, "?afterReportedAt=bad"])("rejects invalid finance pagination %s", async q => {
    expect((await paymentRoute("list_payment_queue")(new Request(`http://localhost${q}`), context)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
