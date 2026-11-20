import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mocks.session }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: mocks.connection }));
import { notificationRoute } from "@/lib/notifications/http";
import { IdentityError } from "@/lib/auth/identity";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.session.mockResolvedValue({ db: { rpc: mocks.rpc } });
});
const request = (body: unknown) => new Request("http://localhost/api/notifications", { method: "POST", body: JSON.stringify(body) });
describe("N01 HTTP", () => {
  it.each([
    ["read", { ids: [id] }, "mark_notifications_read", { p_ids: [id] }, "count"],
    ["read", { before: "2026-11-20T00:00:00Z" }, "mark_all_notifications_read", { p_before: "2026-11-20T00:00:00Z" }, "count"],
    ["setPreference", { channel: "sms", topic: "booking", enabled: true, noticeVersion: "v1", expectedVersion: 0 }, "set_notification_preference",
      { p_channel: "sms", p_topic: "booking", p_enabled: true, p_notice_version: "v1", p_expected_version: 0 }, "version"],
  ] as const)("maps %s without inventing an idempotency argument", async (operation, body, name, args, field) => {
    const response = await notificationRoute(operation)(request(body));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
    expect(await response.json()).toEqual({ [field]: 1 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("validates the failure cursor and calls connection before the session", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const response = await notificationRoute("failures")(new Request(`http://localhost?limit=10&after=${id}`));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("list_notification_failures", { p_limit: 10, p_after: id });
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.session.mock.invocationCallOrder[0]);
  });
  it.each(["?limit=101", "?limit=1&limit=2", "?actor=forged", "?after=bad"])("rejects invalid queries %s", async q => {
    expect((await notificationRoute("failures")(new Request(`http://localhost${q}`))).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires a real session and bounds malformed or injected bodies", async () => {
    mocks.session.mockRejectedValueOnce(new IdentityError(401, "unauthenticated"));
    expect((await notificationRoute("read")(request({ ids: [id] }))).status).toBe(401);
    for (const body of [{ ids: [id], actor: id }, { ids: [id], padding: "x".repeat(16385) }]) {
      expect((await notificationRoute("read")(request(body))).status).toBe(422);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
