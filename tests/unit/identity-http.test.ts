import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { endpoint, input, json } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), command: vi.fn(), requestClient: vi.fn(),
  signUp: vi.fn(), signInWithPassword: vi.fn(),
}));
vi.mock("@/lib/db/request-client", () => ({ requestClient: mocks.requestClient, publicAuthClient: () => ({ auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword } }) }));
vi.mock("@/lib/auth/identity", async (original) => ({ ...await original<typeof import("@/lib/auth/identity")>(), authenticate: mocks.authenticate, command: mocks.command }));
import { PATCH as profile } from "@/app/api/auth/profile/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as organization } from "@/app/api/organizations/route";
import { GET as invitations } from "@/app/api/auth/invitations/route";
import { POST as acceptInvite } from "@/app/api/organizations/[id]/members/accept/route";
import { POST as membership } from "@/app/api/organizations/[id]/members/route";

const id = "10000000-0000-4000-8000-000000000001";
function request(body: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body), headers });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requestClient.mockReturnValue({});
  mocks.authenticate.mockResolvedValue({ userId: id });
  mocks.command.mockResolvedValue(id);
});
describe("private HTTP boundaries", () => {
  it("returns stable private, uncached errors without leaking details", async () => {
    const response = await endpoint(async () => { throw new Error("secret database message"); });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(json({}).headers.get("vary")).toBe("Authorization");
  });
  it("rejects malformed JSON and oversized streamed bodies", async () => {
    for (const body of ["{", "x".repeat(16_385)]) {
      await expect(input(new Request("http://localhost", { method: "POST", body }), z.unknown())).rejects.toMatchObject({ status: 422 });
    }
    await expect(input(new Request("http://localhost"), z.unknown())).rejects.toMatchObject({ status: 422 });
  });
  it("denies unauthenticated profile mutation before invoking a command", async () => {
    mocks.authenticate.mockRejectedValue(new IdentityError(401, "unauthenticated"));
    expect((await profile(request({ displayName: "Synthetic", locale: "en", expectedVersion: 1 }))).status).toBe(401);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("does not forward role injection to a privileged function", async () => {
    expect((await profile(request({ displayName: "Synthetic", locale: "en", expectedVersion: 1, role: "admin" }))).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("forwards only allowlisted profile fields without a client owner ID", async () => {
    expect((await profile(request({ displayName: "Synthetic", locale: "hi", expectedVersion: 3 }))).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({}, "update_self_profile", { p_display_name: "Synthetic", p_locale: "hi", p_expected_version: 3 });
  });
  it("requires a valid org idempotency key", async () => {
    expect((await organization(request({ name: "Synthetic Org" }))).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
    expect((await organization(request({ name: "Synthetic Org" }, { "Idempotency-Key": id }))).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({}, "create_organization", { p_name: "Synthetic Org", p_request_key: id });
  });
  it.each(["cross-org", "inactive-membership"])("propagates DB denial for %s", async () => {
    mocks.command.mockRejectedValue(new IdentityError(403, "forbidden"));
    const response = await membership(request({ profileId: id, membershipRole: "staff", status: "invited", scopes: ["org:read"], expectedVersion: 0 }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "forbidden" } });
  });
  it("rejects malformed org IDs before RPC", async () => {
    expect((await membership(request({}), { params: Promise.resolve({ id: "bad-id" }) })).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
describe("password auth routes", () => {
  const credentials = { email: "patient@example.invalid", password: "synthetic-password" };
  it("never forwards signup role metadata", async () => {
    expect((await signup(request({ ...credentials, role: "doctor" }))).status).toBe(422);
    expect(mocks.signUp).not.toHaveBeenCalled();
    mocks.signUp.mockResolvedValue({ error: null });
    expect((await signup(request(credentials))).status).toBe(202);
    expect(mocks.signUp).toHaveBeenCalledWith(credentials);
  });
  it("preserves Supabase auth rate limiting", async () => {
    mocks.signUp.mockResolvedValue({ error: { status: 429 } });
    expect((await signup(request(credentials))).status).toBe(429);
  });
  it("returns generic invalid credentials and rejects disabled accounts", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: "private details" } });
    const failure = await login(request(credentials));
    expect(failure.status).toBe(401);
    expect(await failure.text()).not.toContain("private details");
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "synthetic-token", refresh_token: "synthetic-refresh" } }, error: null });
    mocks.authenticate.mockRejectedValue(new IdentityError(403, "inactive_account"));
    expect((await login(request(credentials))).status).toBe(403);
  });
  it("allows existing passwords shorter than the signup minimum to reach Auth", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "synthetic-access", refresh_token: "synthetic-refresh" } }, error: null });
    expect((await login(request({ ...credentials, password: "old-pass" }))).status).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ ...credentials, password: "old-pass" });
  });
});


describe("invite acceptance API", () => {
  const context = { params: Promise.resolve({ id }) };
  it("derives the invitee from the session and only forwards org/version", async () => {
    expect((await acceptInvite(request({ expectedVersion: 1 }), context)).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({}, "accept_organization_invite", { p_organization_id: id, p_expected_version: 1 });
  });
  it("rejects caller-supplied invitee IDs", async () => {
    expect((await acceptInvite(request({ expectedVersion: 1, profileId: id }), context)).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("denies anonymous acceptance before RPC", async () => {
    mocks.authenticate.mockRejectedValue(new IdentityError(401, "unauthenticated"));
    expect((await acceptInvite(request({ expectedVersion: 1 }), context)).status).toBe(401);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it.each([[403, "forbidden"], [409, "conflict"]])("propagates acceptance denial %s", async (status, code) => {
    mocks.command.mockRejectedValue(new IdentityError(status, code));
    expect((await acceptInvite(request({ expectedVersion: 1 }), context)).status).toBe(status);
  });
  it("maps the DB organization cap to a safe validation error", async () => {
    mocks.command.mockRejectedValue(new IdentityError(422, "invalid_input"));
    expect((await organization(request({ name: "Synthetic Sixth" }, { "Idempotency-Key": id }))).status).toBe(422);
  });
});


describe("own invitation discovery", () => {
  it("uses the session-scoped RPC without accepting an invitee ID", async () => {
    mocks.command.mockResolvedValue([{ organization_id: id, scopes: ["org:read"], version: 1 }]);
    const response = await invitations(new Request("http://localhost/api/auth/invitations?profileId=ignored"));
    expect(response.status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({}, "list_organization_invites", {});
    expect(await response.json()).toEqual({ invitations: [{ organization_id: id, scopes: ["org:read"], version: 1 }] });
  });
  it("denies anonymous discovery", async () => {
    mocks.authenticate.mockRejectedValue(new IdentityError(401, "unauthenticated"));
    expect((await invitations(new Request("http://localhost/api/auth/invitations"))).status).toBe(401);
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
describe("Auth outage HTTP status", () => {
  it("keeps upstream failures out of the invalid-credentials response", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 503, message: "private upstream details" } });
    const response = await login(request({ email: "patient@example.invalid", password: "synthetic-password" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "identity_unavailable" } });
  });
});
