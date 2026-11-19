import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { POST as createBooking } from "@/app/api/bookings/route";
import { POST as acceptBooking } from "@/app/api/bookings/[id]/accept/route";

// P5 shared engine §10.1: generic routes have no env flag; the database gate decides and
// 55000 feature_unavailable / feature_suspended reach the client as 503 feature_unavailable.
const id = "10000000-0000-4000-8000-000000000001";
const create = () => new Request("http://localhost/api/bookings", { method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": id },
  body: JSON.stringify({ patientId: id, serviceId: id, addressId: id, startAt: "2027-01-01T09:00:00Z" }) });
const accept = () => new Request(`http://localhost/api/bookings/${id}/accept`, { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: 2, resourceIds: [id] }) });
const ctx = { params: Promise.resolve({ id }) };
beforeEach(() => {
  mock.rpc.mockReset();
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
});

it.each(["feature_unavailable", "feature_suspended"])("POST /api/bookings returns 503 when the gate says %s", async (message) => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
  const res = await createBooking(create());
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
  expect(mock.rpc).toHaveBeenCalledWith("create_booking_request", expect.objectContaining({ p_request_key: id }));
});

it.each(["feature_unavailable", "feature_suspended"])("POST /api/bookings/:id/accept returns 503 when the gate says %s", async (message) => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
  const res = await acceptBooking(accept(), ctx);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
});

it("an ordinary state conflict stays 409", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "invalid_transition" } });
  const res = await acceptBooking(accept(), ctx);
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "conflict" } });
});
