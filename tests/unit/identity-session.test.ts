import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ refreshSession: vi.fn(), signOut: vi.fn(), authenticate: vi.fn() }));
vi.mock("@/lib/db/request-client", () => ({ publicAuthClient: () => ({ auth: { refreshSession: mocks.refreshSession } }), requestClient: () => ({ auth: { admin: { signOut: mocks.signOut } } }), bearerToken: () => "synthetic-access" }));
vi.mock("@/lib/auth/identity", async (original) => ({ ...await original<typeof import("@/lib/auth/identity")>(), authenticate: mocks.authenticate }));
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { IdentityError } from "@/lib/auth/identity";

beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue({ userId: "synthetic-id" }); });
const request = (data: unknown) => new Request("http://localhost/api/auth/refresh", { method: "POST", body: JSON.stringify(data) });
describe("session lifecycle", () => {
  it("refreshes verified active accounts only", async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_at: 1 } }, error: null });
    const response = await refresh(request({ refreshToken: "synthetic-refresh" }));
    expect(response.status).toBe(200);
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: "synthetic-refresh" });
    expect(await response.json()).toEqual({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: 1 });
    mocks.authenticate.mockRejectedValue(new IdentityError(403, "inactive_account"));
    expect((await refresh(request({ refreshToken: "synthetic-refresh" }))).status).toBe(403);
  });
  it("denies invalid refresh and extra fields", async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 401 } });
    expect((await refresh(request({ refreshToken: "synthetic-refresh" }))).status).toBe(401);
    expect((await refresh(request({ refreshToken: "synthetic-refresh", role: "admin" }))).status).toBe(422);
  });
  it("revokes the supplied session without signing out other devices", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    expect((await logout(request({}))).status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith("synthetic-access", "local");
  });
});
