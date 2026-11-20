import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), realSession: undefined as unknown, connection: vi.fn() }));
vi.mock("@/lib/auth/http", async original => {
  const real = await original<typeof import("@/lib/auth/http")>();
  mock.realSession = real.session;
  return { ...real, session: mock.session };
});
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: mock.connection }));
import { bookingCommand } from "@/lib/booking/service";
import { CLINICAL_CONFLICT_CODES, CLINICAL_CONTENT_CODES, clinicalCommand } from "@/lib/clinical/service";
import { GET as getDraft, PUT as putDraft } from "@/app/api/bookings/[id]/consultation/draft/route";
import { POST as sign } from "@/app/api/bookings/[id]/consultation/sign/route";
import { GET as listRecords } from "@/app/api/bookings/[id]/consultation/records/route";
import { GET as getRecord } from "@/app/api/clinical-records/[id]/route";
import { POST as amend } from "@/app/api/clinical-records/[id]/amend/route";

const id = "10000000-0000-4000-8000-000000000001";
const key = "30000000-0000-4000-8000-000000000003";
const ctx = { params: Promise.resolve({ id }) };
const content = { vitals: { spo2_pct: 97 }, examination: { findings: "Synthetic findings" } };
const send = (method: string, body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request(`http://localhost/api/x/${id}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = () => new Request(`http://localhost/api/x/${id}`);
type Handler = (request: Request, context: typeof ctx) => Promise<Response>;

const commands: [string, Handler, string, unknown, string, Record<string, unknown>, number, string][] = [
  ["save draft", putDraft, "PUT", { expectedVersion: 0, content }, "save_clinical_draft",
    { p_booking_id: id, p_expected_version: 0, p_content: content, p_request_key: key }, 200, "version"],
  ["sign", sign, "POST", { expectedVersion: 3, authoredConfirmed: true, allergiesReviewed: false }, "sign_clinical_record",
    { p_booking_id: id, p_expected_version: 3, p_authored_confirmed: true, p_allergies_reviewed: false, p_request_key: key }, 201, "recordId"],
  ["amend", amend, "POST", { content, reason: "Synthetic correction", authoredConfirmed: true, allergiesReviewed: true }, "amend_clinical_record",
    { p_record_id: id, p_content: content, p_reason: "Synthetic correction", p_authored_confirmed: true, p_allergies_reviewed: true, p_request_key: key }, 201, "recordId"],
];
const reads: [string, Handler, string, Record<string, unknown>, (data: unknown) => unknown][] = [
  ["draft", getDraft, "get_clinical_draft", { p_booking_id: id }, d => ({ draft: d })],
  ["records", listRecords, "list_clinical_records", { p_booking_id: id }, d => d],
  ["record", getRecord, "get_clinical_record", { p_record_id: id }, d => ({ record: d })],
];

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: 6, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
  mock.connection.mockReset().mockResolvedValue(undefined);
});

describe("clinical commands call one fixed RPC with exact arguments", () => {
  it.each(commands)("%s", async (_, handler, method, body, name, args, status, field) => {
    const res = await handler(send(method, body), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ [field]: 6 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(name, args);
    expect(mock.connection).toHaveBeenCalled();
  });
  it.each(commands)("%s requires an Idempotency-Key", async (_, handler, method, body) => {
    const res = await handler(send(method, body, {}), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(commands)("%s rejects extra keys before the RPC", async (_, handler, method, body) => {
    const res = await handler(send(method, { ...body as object, signedBy: id }), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("invalid clinical content never reaches the RPC", async () => {
    const res = await putDraft(send("PUT", { expectedVersion: 1, content: { vitals: { spo2_pct: 101 } } }), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("sign without authorship confirmation never reaches the RPC", async () => {
    const res = await sign(send("POST", { expectedVersion: 3, authoredConfirmed: false, allergiesReviewed: true }), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("a malformed id is 422 without an RPC", async () => {
    const res = await getRecord(get(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("clinical reads", () => {
  it.each(reads)("%s", async (_, handler, name, args, wrap) => {
    const data = { record_id: id, content: {} };
    mock.rpc.mockResolvedValue({ data, error: null });
    const res = await handler(get(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual(wrap(data));
    expect(mock.rpc).toHaveBeenCalledWith(name, args);
    expect(mock.connection).toHaveBeenCalled();
  });
  it.each([...commands.map(c => [c[0], c[1], c[2], c[3]] as const), ...reads.map(r => [r[0], r[1], "GET", undefined] as const)])(
    "%s returns 401 without a bearer token", async (_, handler, method, body) => {
      mock.session.mockImplementation(mock.realSession as typeof mock.session);
      const res = await handler(body === undefined ? get() : send(method, body), ctx);
      expect(res.status).toBe(401);
      expect(mock.rpc).not.toHaveBeenCalled();
    });
});

describe("error mapping (design A6)", () => {
  it.each([...CLINICAL_CONFLICT_CODES])("%s passes through as 409", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: message === "stale_version" ? "40001" : "55000", message } });
    const res = await putDraft(send("PUT", { expectedVersion: 1, content }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: message } });
  });
  it.each([...CLINICAL_CONTENT_CODES])("%s passes through as 422", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "22023", message } });
    const res = await sign(send("POST", { expectedVersion: 3, authoredConfirmed: true, allergiesReviewed: true }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: { code: message } });
  });
  it("idempotency_conflict stays a generic 409", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "idempotency_conflict" } });
    const res = await putDraft(send("PUT", { expectedVersion: 1, content }), ctx);
    expect(await res.json()).toEqual({ error: { code: "conflict" } });
  });
  it.each(["feature_unavailable", "feature_suspended"])("gate %s is 503 feature_unavailable", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
    const res = await putDraft(send("PUT", { expectedVersion: 1, content }), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
  });
  it("draft_save_limit is a generic 429", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "53300", message: "draft_save_limit" } });
    const res = await putDraft(send("PUT", { expectedVersion: 1, content }), ctx);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "rate_limited" } });
  });
  it("other database text is never echoed", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Synthetic findings leaked" } });
    const res = await putDraft(send("PUT", { expectedVersion: 1, content }), ctx);
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).not.toContain("Synthetic");
  });
  it.each(["42501", "P0002", "40001", "40P01", "23P01", "23505", "55000", "23503", "23514", "22023", "22007", "22008", "22003", "57014", "53300", "XX000"])(
    "SQLSTATE %s maps exactly like bookingCommand", async (code) => {
      const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "invalid_transition" } }) };
      const outcome = async (run: () => Promise<unknown>) => { try { await run(); return "ok"; } catch (e) { const x = e as IdentityError; return `${x.status}:${x.code}`; } };
      expect(await outcome(() => clinicalCommand(failing, "save_clinical_draft", {}))).toBe(await outcome(() => bookingCommand(failing, "advance_visit", {})));
    });
  it("deadlocks are retried", async () => {
    const db = { rpc: vi.fn().mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock" } }).mockResolvedValueOnce({ data: 7, error: null }) };
    expect(await clinicalCommand(db, "save_clinical_draft", {})).toBe(7);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
});
