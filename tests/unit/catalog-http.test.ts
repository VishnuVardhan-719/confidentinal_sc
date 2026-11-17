import { beforeEach, expect, it, vi } from "vitest";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/db/request-client", () => ({ publicAuthClient: () => ({ rpc: mock.rpc }) }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { GET as search } from "@/app/api/catalog/route";
import { GET as detail } from "@/app/api/catalog/[id]/route";
import { GET as privateRead, POST as create } from "@/app/api/provider/services/route";
import { POST as price } from "@/app/api/provider/services/[id]/prices/route";
import { POST as coverage } from "@/app/api/provider/coverage/route";
import { POST as review } from "@/app/api/catalog/admin/coverage/[id]/review/route";
import { GET as queue } from "@/app/api/catalog/admin/coverage/route";
const id = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id }) };
const get = (query: string) => new Request(`http://localhost/api/catalog?${query}`);
const post = (body: unknown, key: string | null = other) => new Request("http://localhost/api/provider/services", {
  method: "POST", body: JSON.stringify(body), headers: key ? { "Idempotency-Key": key } : {},
});
const row = { provider_id: id, category: "doctor", display_name: "Synthetic", service_id: other,
  service_title: "Synthetic visit", duration_minutes: 30, amount_paise: "10000000000", currency: "INR", unit: "visit",
  terms_version: "synthetic-v1", pin_code: "500001", city: "Synthetic", advisory_availability: null };
beforeEach(() => { vi.resetAllMocks(); mock.rpc.mockResolvedValue({ data: [], error: null }); mock.session.mockResolvedValue({ db: { rpc: mock.rpc } }); });
it("rejects invalid, duplicate, unknown and missing search parameters before RPC", async () => {
  for (const query of ["category=doctor", "category=doctor&pin=5%25", "category=doctor&pin=500001&limit=51", "category=doctor&pin=500001&pin=500002", "category=doctor&pin=500001&ownerId=x"]) {
    expect((await search(get(query))).status).toBe(422);
  }
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("projects only public fields, preserves paise and emits a stable cursor", async () => {
  mock.rpc.mockResolvedValue({ data: [{ ...row, owner_profile_id: id, storage_path: "private", version: 4 }], error: null });
  const result = await search(get("category=doctor&pin=500001&limit=1"));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ results: [row], nextCursor: `${row.amount_paise},${id},${other}` });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("passes cursor tuple and price filter as parameters", async () => {
  await search(get(`category=doctor&pin=500001&priceMax=100&cursor=1,${id},${other}`));
  expect(mock.rpc).toHaveBeenCalledWith("search_providers", expect.objectContaining({ p_after_amount: "1", p_after_provider: id, p_after_service: other, p_price_max: "100" }));
});
it("returns identical not-found responses for invisible and unknown providers", async () => {
  const a = await detail(get("category=doctor&pin=500001"), context);
  const b = await detail(get("category=doctor&pin=500001"), { params: Promise.resolve({ id: other }) });
  expect(a.status).toBe(404); expect(b.status).toBe(404);
  expect(await a.text()).toBe(await b.text());
});
it("requires authentication for provider commands", async () => {
  mock.session.mockRejectedValue(new IdentityError(401, "unauthenticated"));
  expect((await create(post({}))).status).toBe(401);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([[null, 1], [{ coverage_version: 4 }, 4]])("returns an independent coverage counter %j", async (counter, expected) => {
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: table === "providers" ? { id, version: 9 } : counter, error: null }),
    };
    return chain;
  });
  mock.session.mockResolvedValue({ db: { from } });
  const result = await privateRead(get(`providerId=${id}`));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ providerVersion: 9, coverageVersion: expected, services: [], coverage: [] });
});
it("requires a session and bounded cursor for the coverage queue", async () => {
  expect((await queue(get("limit=51"))).status).toBe(422);
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.session.mockRejectedValue(new IdentityError(401, "unauthenticated"));
  expect((await queue(get("limit=20"))).status).toBe(401);
});
it("parameters coverage queue reads without accepting authority", async () => {
  expect((await queue(get(`limit=1&cursor=0,2026-11-17T10:00:00.000Z,${id}`))).status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("list_service_area_reviews", { p_limit: 1, p_after: id,
    p_after_priority: 0, p_after_created_at: "2026-11-17T10:00:00.000Z" });
});
it("preserves the queue row's original sort tuple in its cursor", async () => {
  const entry = { area_id: id, provider_id: other, category: "doctor", display_name: "Synthetic", pin_code: "500001",
    status: "proposed", valid_from: null, valid_to: null, version: 1, created_at: "2026-11-17T10:00:00.000Z" };
  mock.rpc.mockResolvedValue({ data: [entry], error: null });
  const result = await queue(get("limit=1"));
  expect(await result.json()).toEqual({ results: [entry], nextCursor: `0,2026-11-17T10:00:00.000Z,${id}` });
});
it("requires creation idempotency and rejects injected approval", async () => {
  const value = { providerId: id, catalogTypeId: other, title: "Synthetic", durationMinutes: 30, status: "draft", expectedVersion: 0 };
  expect((await create(post(value, null))).status).toBe(422);
  expect((await create(post({ ...value, verified: true }))).status).toBe(422);
  mock.rpc.mockResolvedValue({ data: { id }, error: null });
  expect((await create(post(value))).status).toBe(201);
  expect(mock.rpc).toHaveBeenCalledWith("upsert_service", expect.objectContaining({ p_request_key: other, p_provider_id: id, p_expected_version: 0 }));
});
it("never accepts numeric/float paise or client effective dates", async () => {
  for (const amountPaise of [100, "1.5", "-1", "10000000001"]) expect((await price(post({ amountPaise, termsVersion: "v1", expectedVersion: 1 }), context)).status).toBe(422);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("requires approval expiry and does not accept coverage status from providers", async () => {
  expect((await review(post({ decision: "approved", reason: "Synthetic", expectedVersion: 1 }), context)).status).toBe(422);
  expect((await coverage(post({ providerId: id, pin: "500001", expectedVersion: 1, status: "approved" }))).status).toBe(422);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([["42501", 403], ["40001", 409], ["23514", 422], ["XX000", 503]])("sanitizes database error %s", async (code, status) => {
  mock.rpc.mockResolvedValue({ error: { code, message: "private clinical details" }, data: null });
  const result = await search(get("category=doctor&pin=500001"));
  expect(result.status).toBe(status);
  expect(await result.text()).not.toContain("private clinical");
});
