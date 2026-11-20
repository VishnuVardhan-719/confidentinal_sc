import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { GET as listExceptions } from "@/app/api/ops/exceptions/route";
import { POST as closeBooking } from "@/app/api/ops/bookings/[id]/close/route";
import { POST as resolveException } from "@/app/api/ops/exceptions/[id]/resolve/route";
import { POST as readContact } from "@/app/api/bookings/[id]/contact/route";

const id = "10000000-0000-4000-8000-000000000001";
const key = "30000000-0000-4000-8000-000000000003";
const ctx = { params: Promise.resolve({ id }) };
const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request("http://localhost/api/ops", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const close = { expectedVersion: 4, outcome: "no_show", reason: "no_show_confirmed" };
const resolve = { expectedVersion: 2, resolution: "resolved" };
const commands = [
  ["ops_close_booking", (r: Request) => closeBooking(r, ctx), close,
    { p_booking_id: id, p_expected_version: 4, p_outcome: "no_show", p_reason: "no_show_confirmed", p_request_key: key }],
  ["ops_resolve_exception", (r: Request) => resolveException(r, ctx), resolve,
    { p_exception_id: id, p_expected_version: 2, p_resolution: "resolved", p_request_key: key }],
] as const;

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: 5, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
});

describe("ops commands", () => {
  it.each(commands)("%s calls the fixed RPC with exact args", async (name, call, body, args) => {
    const res = await call(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 5 });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(commands)("%s requires a UUID Idempotency-Key before reading the body", async (_name, call, body) => {
    for (const headers of [{}, { "Idempotency-Key": "forged" }] as Record<string, string>[]) {
      const req = post(body, headers);
      expect((await call(req)).status).toBe(422);
      expect(req.bodyUsed).toBe(false);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(commands)("%s rejects unknown fields and bad values", async (_name, call, body) => {
    for (const bad of [{ ...body, state: "completed" }, { ...body, expectedVersion: 0 }, { ...body, expectedVersion: "4" }]) {
      expect((await call(post(bad))).status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("close rejects an outcome or reason outside the contract", async () => {
    for (const bad of [{ ...close, outcome: "completed" }, { ...close, reason: "other" }]) {
      expect((await closeBooking(post(bad), ctx)).status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("resolve rejects absence resolutions (those go through close)", async () => {
    for (const resolution of ["no_show_confirmed", "absence_disputed"]) {
      expect((await resolveException(post({ ...resolve, resolution }), ctx)).status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a non-UUID route id", async () => {
    expect((await closeBooking(post(close), { params: Promise.resolve({ id: "1" }) })).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["42501", "forbidden", 403, "forbidden"], ["40001", "stale_version", 409, "conflict"], ["55000", "not_escalatable", 409, "conflict"],
    ["55000", "invalid_transition", 409, "conflict"], ["55000", "feature_unavailable", 503, "feature_unavailable"],
    ["22023", "invalid_reason", 422, "invalid_input"], ["P0002", "not_found", 404, "not_found"],
  ])("maps SQLSTATE %s %s to %i", async (code, message, status, body) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const res = await closeBooking(post(close), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code: body } });
  });
});

describe("ops exception queue", () => {
  const get = (qs = "") => listExceptions(new Request(`http://localhost/api/ops/exceptions${qs}`));
  it("defaults to 20 from the start", async () => {
    mock.rpc.mockResolvedValue({ data: [{ booking_id: id }], error: null });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ booking_id: id }] });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("list_booking_exceptions", { p_limit: 20, p_after_booking: null });
  });
  it("passes limit and cursor", async () => {
    await get(`?limit=5&after=${id}`);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("list_booking_exceptions", { p_limit: 5, p_after_booking: id });
  });
  it.each(["?limit=0", "?limit=51", "?after=x", "?limit=5&limit=6", "?provider=" + id])("rejects %s", async qs => {
    expect((await get(qs)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("assignment contact", () => {
  const contact = { booking_id: id, public_ref: "SCV-1", address: { line1: "1 Main", locality: "X", pin_code: "560001" }, contact: { name: "A", phone: "+919876543210" } };
  it("returns the projection with no-store and calls only get_assignment_contact", async () => {
    mock.rpc.mockResolvedValue({ data: contact, error: null });
    const res = await readContact(new Request(`http://localhost/api/bookings/${id}/contact`, { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contact });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_assignment_contact", { p_booking_id: id });
  });
  it("a denied read is 404, same as a missing booking", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "not_found" } });
    const res = await readContact(new Request(`http://localhost/api/bookings/${id}/contact`, { method: "POST" }), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
  });
});
