import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), connection: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/notifications/worker-client", () => ({ notificationWorkerClient: mocks.client }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: mocks.connection }));
import { GET, POST } from "@/app/api/internal/notifications/dispatch/route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-cron-secret"); mocks.client.mockReturnValue({ rpc: mocks.rpc }); });
afterEach(() => vi.unstubAllEnvs());
describe("N01 cron endpoint", () => {
  it.each([GET, POST])("refuses wrong or missing credentials before any client or RPC", async handler => {
    for (const headers of [{}, { Authorization: "Bearer wrong" }] as Record<string, string>[]) {
      const response = await handler(new Request("http://localhost/api/internal/notifications/dispatch", { headers }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "unauthenticated" } });
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.connection).toHaveBeenCalled();
  });
  it("returns counts only when disabled, and refuses enabled unreviewed configuration", async () => {
    const request = () => new Request("http://localhost", { headers: { Authorization: "Bearer synthetic-cron-secret" } });
    vi.stubEnv("FEATURE_NOTIFY_SMS", "false");
    vi.stubEnv("FEATURE_NOTIFY_EMAIL", "false");
    vi.stubEnv("FEATURE_NOTIFY_WHATSAPP", "false");
    expect(await (await GET(request())).json()).toEqual({ claimed: 0, accepted: 0, failed: 0 });
    vi.stubEnv("FEATURE_NOTIFY_SMS", "true"); vi.stubEnv("NOTIFY_SMS_ADAPTER", "log");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
