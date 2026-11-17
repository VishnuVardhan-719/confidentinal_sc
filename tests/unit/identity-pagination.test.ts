import { describe, expect, it, vi, beforeEach } from "vitest";
import { listQuery } from "@/lib/auth/pagination";
import { IdentityError } from "@/lib/auth/identity";
const mocks = vi.hoisted(() => ({ session: vi.fn(), command: vi.fn() }));
vi.mock("@/lib/auth/http", async (original) => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mocks.session }));
vi.mock("@/lib/auth/identity", async (original) => ({ ...await original<typeof import("@/lib/auth/identity")>(), command: mocks.command }));
import { GET as organizations } from "@/app/api/organizations/route";
import { GET as invitations } from "@/app/api/organizations/invitations/route";
import { GET as members } from "@/app/api/organizations/[id]/members/route";
const id = "10000000-0000-4000-8000-000000000001";
const request = (query = "") => new Request("http://localhost/api/organizations" + query);
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ db: {}, actor: { userId: id } }); });
describe("list query validation", () => {
  it("defaults to twenty rows with no cursor", () => {
    expect(listQuery(request())).toEqual({ limit: 20 });
  });
  it("accepts a UUID cursor and the maximum page size", () => {
    expect(listQuery(request("?limit=50&cursor=" + id))).toEqual({ limit: 50, cursor: id });
  });
  it.each(["?limit=0", "?limit=51", "?limit=-1", "?limit=1.5", "?limit=1e1", "?limit=", "?limit=abc", "?cursor=bad", "?limit=1&limit=2", "?cursor=" + id + "&cursor=" + id, "?profileId=" + id])("rejects invalid/ambiguous queries %s", (query) => {
    expect(() => listQuery(request(query))).toThrow(IdentityError);
  });
});
describe("paginated list routes", () => {
  it("returns a scoped organization page and continuation cursor", async () => {
    const page = { organizations: [{ id, name: "Synthetic", version: 1 }], nextCursor: id };
    mocks.command.mockResolvedValue(page);
    const response = await organizations(request("?limit=1&cursor=" + id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(mocks.command).toHaveBeenCalledWith({}, "list_organizations", { p_limit: 1, p_cursor: id });
  });
  it("passes validated organization membership boundaries", async () => {
    mocks.command.mockResolvedValue({ members: [], nextCursor: null });
    expect((await members(request("?limit=50"), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({}, "list_organization_members", { p_organization_id: id, p_limit: 50, p_cursor: null });
  });
  it("rejects oversized pages before any RPC", async () => {
    expect((await organizations(request("?limit=51"))).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("keeps anonymous requests denied", async () => {
    mocks.session.mockRejectedValue(new IdentityError(401, "unauthenticated"));
    expect((await organizations(request())).status).toBe(401);
    expect(mocks.command).not.toHaveBeenCalled();
  });
});


describe("paginated invitation route", () => {
  it("passes validated limits/cursors to the own-invite RPC", async () => {
    mocks.command.mockResolvedValue({ invitations: [], nextCursor: null });
    const response = await invitations(request("?limit=3&cursor=" + id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invitations: [], nextCursor: null });
    expect(mocks.command).toHaveBeenCalledWith({}, "list_organization_invites_page", { p_limit: 3, p_cursor: id });
  });
  it("rejects forged invitee query fields", async () => {
    expect((await invitations(request("?profileId=" + id))).status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
