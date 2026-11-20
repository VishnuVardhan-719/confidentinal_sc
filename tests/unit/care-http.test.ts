import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), realSession: undefined as unknown, publicClient: vi.fn() }));
vi.mock("@/lib/auth/http", async original => {
  const real = await original<typeof import("@/lib/auth/http")>();
  mock.realSession = real.session;
  return { ...real, session: mock.session };
});
vi.mock("@/lib/db/request-client", async original => ({ ...await original<typeof import("@/lib/db/request-client")>(), publicAuthClient: mock.publicClient }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: async () => {} }));
import { bookingCommand } from "@/lib/booking/service";
import { CARE_CONFLICT_CODES, careCommand } from "@/lib/care/service";
import { GET as getTasks } from "@/app/api/care/services/[id]/tasks/route";
import { PUT as putTasks } from "@/app/api/provider/services/[id]/care-tasks/route";
import { GET as getPlan } from "@/app/api/care/bookings/[id]/route";
import { POST as start } from "@/app/api/care/bookings/[id]/start/route";
import { POST as end } from "@/app/api/care/bookings/[id]/end/route";
import { POST as interrupt } from "@/app/api/care/bookings/[id]/interrupt/route";
import { POST as attest } from "@/app/api/care/bookings/[id]/attest/route";

const id = "10000000-0000-4000-8000-000000000001";
const key = "30000000-0000-4000-8000-000000000003";
const ctx = { params: Promise.resolve({ id }) };
const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request(`http://localhost/api/care/bookings/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
type Handler = (request: Request, context: typeof ctx) => Promise<Response>;
const commands: [string, Handler, unknown, string, Record<string, unknown>][] = [
  ["start", start, { expectedVersion: 4 }, "advance_care", { p_booking_id: id, p_step: "started", p_expected_version: 4, p_request_key: key }],
  ["end", end, { expectedVersion: 5 }, "advance_care", { p_booking_id: id, p_step: "ended", p_expected_version: 5, p_request_key: key }],
  ["interrupt", interrupt, { expectedVersion: 5, reason: "ended_for_emergency" }, "interrupt_care", { p_booking_id: id, p_reason: "ended_for_emergency", p_expected_version: 5, p_request_key: key }],
  ["attest", attest, { expectedVersion: 4, decision: "disputed" }, "attest_care", { p_booking_id: id, p_decision: "disputed", p_expected_version: 4, p_request_key: key }],
  ["care-tasks", putTasks, { taskCodes: ["companionship", "meal_support"], expectedVersion: 0 }, "set_care_service_tasks", { p_service_id: id, p_task_codes: ["companionship", "meal_support"], p_expected_version: 0, p_request_key: key }],
];

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: 6, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
  mock.publicClient.mockReset().mockReturnValue({ rpc: mock.rpc });
});

describe("care routes call one fixed RPC with exact arguments (design V4)", () => {
  it.each(commands)("%s", async (_, handler, body, name, args) => {
    const res = await handler(post(body), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 6 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(name, args);
  });
  it.each(commands)("%s requires an Idempotency-Key and never calls the RPC without one", async (_, handler, body) => {
    const res = await handler(post(body, {}), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(commands)("%s rejects extra keys before the RPC", async (_, handler, body) => {
    const res = await handler(post({ ...body as object, state: "completed", actorId: id }), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("GET /api/care/bookings/:id reads get_care_plan", async () => {
    mock.rpc.mockResolvedValue({ data: { booking_id: id, substate: "assigned" }, error: null });
    const res = await getPlan(new Request(`http://localhost/api/care/bookings/${id}`), ctx);
    expect(await res.json()).toEqual({ carePlan: { booking_id: id, substate: "assigned" } });
    expect(mock.rpc).toHaveBeenCalledWith("get_care_plan", { p_booking_id: id });
  });
  it("a malformed booking id is 422 without an RPC", async () => {
    const res = await start(post({ expectedVersion: 4 }), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("guest task read and sessions (design V5)", () => {
  it("GET /api/care/services/:id/tasks needs no session and maps the projection", async () => {
    mock.rpc.mockResolvedValue({ data: { service_id: id, task_codes: ["companionship"], version: 2, bookable: false }, error: null });
    const res = await getTasks(new Request(`http://localhost/api/care/services/${id}/tasks`), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ serviceId: id, taskCodes: ["companionship"], version: 2, bookable: false });
    expect(mock.session).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("get_care_service_tasks", { p_service_id: id });
  });
  it.each([...commands.map(c => [c[0], c[1], c[2]] as const), ["plan", getPlan as Handler, undefined] as const])("%s returns 401 without a bearer token", async (_, handler, body) => {
    mock.session.mockImplementation(mock.realSession as typeof mock.session);
    const req = body === undefined ? new Request(`http://localhost/api/care/bookings/${id}`) : post(body);
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("error mapping (design V3, contract §10.1)", () => {
  it.each([...CARE_CONFLICT_CODES])("%s passes through as 409", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: message === "offer_changed" ? "40001" : "55000", message } });
    const res = await start(post({ expectedVersion: 4 }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: message } });
  });
  it.each(["feature_unavailable", "feature_suspended"])("gate %s is 503 feature_unavailable", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
    const res = await start(post({ expectedVersion: 4 }), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
  });
  it("other database text is never echoed", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "private data +919999999999" } });
    const res = await end(post({ expectedVersion: 5 }), ctx);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("private");
  });
  it.each(["42501", "P0002", "40001", "40P01", "23P01", "23505", "55000", "23503", "23514", "22023", "22007", "22008", "22003", "57014", "53300", "XX000"])(
    "SQLSTATE %s maps exactly like bookingCommand", async (code) => {
      const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "invalid_transition" } }) };
      const outcome = async (run: () => Promise<unknown>) => { try { await run(); return "ok"; } catch (e) { const x = e as IdentityError; return `${x.status}:${x.code}`; } };
      expect(await outcome(() => careCommand(failing, "advance_care", {}))).toBe(await outcome(() => bookingCommand(failing, "advance_visit", {})));
    });
  it("deadlocks are retried", async () => {
    const db = { rpc: vi.fn().mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock" } }).mockResolvedValueOnce({ data: 7, error: null }) };
    expect(await careCommand(db, "advance_care", {})).toBe(7);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
});
