import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { GET } from "@/app/api/availability/route";

const ref = "SCV-DOC-100001";
const service = "10000000-0000-4000-8000-000000000001";
const get = (q: string) => new Request(`http://localhost/api/availability?${q}`);
beforeEach(() => {
  mock.rpc.mockReset();
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
});

it("passes the public reference to list_slots and returns advisory slots", async () => {
  const slots = [{ start_at: "2027-01-01T04:00:00Z", end_at: "2027-01-01T04:30:00Z", advisory: true }];
  mock.rpc.mockResolvedValue({ data: slots, error: null });
  const res = await GET(get(`provider=${ref}&service=${service}&date=2027-01-01`));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ slots, advisory: true });
  expect(mock.rpc).toHaveBeenCalledWith("list_slots", { p_provider_reference: ref, p_service_id: service, p_date: "2027-01-01" });
});

it("rejects a provider UUID before reaching the database", async () => {
  const res = await GET(get(`provider=${service}&service=${service}&date=2027-01-01`));
  expect(res.status).toBe(422);
  expect(mock.rpc).not.toHaveBeenCalled();
});
