import { describe, expect, it, vi } from "vitest";
import { profilePatchSchema, membershipSchema, credentialsSchema, acceptInviteSchema } from "@/lib/validation/identity";
import { authenticate, command, IdentityError } from "@/lib/auth/identity";

const userId = "10000000-0000-4000-8000-000000000001";
describe("identity input boundaries", () => {
  it("rejects role, owner, status and unknown-field injection", () => {
    for (const field of ["role", "id", "status", "admin", "organization_id"]) {
      expect(profilePatchSchema.safeParse({ displayName: "Synthetic", locale: "en", expectedVersion: 1, [field]: "admin" }).success).toBe(false);
    }
    expect(credentialsSchema.safeParse({ email: "patient@example.invalid", password: "synthetic-password", role: "doctor" }).success).toBe(false);
  });
  it("rejects membership escalation and unbounded scopes", () => {
    const member = { profileId: userId, membershipRole: "staff", status: "active", scopes: ["org:read"], expectedVersion: 1 };
    expect(membershipSchema.safeParse(member).success).toBe(true);
    for (const role of ["owner", "admin", "doctor", "lab", "ambulance", "caretaker"]) {
      expect(membershipSchema.safeParse({ ...member, membershipRole: role }).success).toBe(false);
    }
    expect(membershipSchema.safeParse({ ...member, scopes: ["admin:grant"] }).success).toBe(false);
  });
  it("bounds names and requires positive versions", () => {
    expect(profilePatchSchema.safeParse({ displayName: " ", locale: "en", expectedVersion: 0 }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ displayName: " Synthetic ", locale: "te", expectedVersion: 1 }).data?.displayName).toBe("Synthetic");
  });
});

describe("server identity", () => {
  function client(active = true, authenticated = true) {
    const single = vi.fn().mockResolvedValue({ data: active ? { id: userId, status: "active" } : null, error: null });
    const eq = vi.fn().mockReturnThis();
    const from = vi.fn().mockReturnValue({ select: () => ({ eq, maybeSingle: single }) });
    // The query builder supports both chained eq calls and maybeSingle.
    eq.mockReturnValue({ eq, maybeSingle: single });
    return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: authenticated ? { id: userId } : null }, error: null }) }, from, rpc: vi.fn() };
  }
  it("denies unauthenticated callers before querying private data", async () => {
    const db = client(true, false);
    await expect(authenticate(db)).rejects.toMatchObject({ status: 401 });
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each([{ status: 503 }, { status: 500 }, { status: 0 }, { name: "AuthRetryableFetchError" }])("reports Auth service failure as unavailable: %j", async (error) => {
    const db = client();
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(authenticate(db)).rejects.toMatchObject({ status: 503, code: "identity_unavailable" });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("reports thrown network failures without leaking transport details", async () => {
    const db = client();
    db.auth.getUser.mockRejectedValue(new TypeError("private network detail"));
    await expect(authenticate(db)).rejects.toMatchObject({ status: 503, message: "identity_unavailable" });
  });
  it.each([400, 401, 403])("keeps invalid session status %s unauthorized", async (status) => {
    const db = client();
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
    await expect(authenticate(db)).rejects.toMatchObject({ status: 401 });
  });
  it("preserves Auth throttling without treating it as an invalid token", async () => {
    const db = client();
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 429 } });
    await expect(authenticate(db)).rejects.toMatchObject({ status: 429 });
  });
  it("denies inactive accounts", async () => {
    await expect(authenticate(client(false))).rejects.toMatchObject({ status: 403 });
  });
  it("uses verified Auth identity, not browser role claims", async () => {
    expect((await authenticate(client())).userId).toBe(userId);
  });
  it.each([["42501", 403], ["40001", 409], ["23505", 409], ["22023", 422], ["XX000", 500]])("maps %s without leaking database details", async (code, status) => {
    const db = client();
    db.rpc.mockResolvedValue({ data: null, error: { code, message: "private database detail" } });
    await expect(command(db, "update_self_profile", {})).rejects.toMatchObject({ status });
    try { await command(db, "update_self_profile", {}); } catch (error) {
      expect(error).toBeInstanceOf(IdentityError);
      expect((error as Error).message).not.toContain("private database detail");
    }
  });
});


describe("invitation boundaries", () => {
  it("rejects active creation but preserves updates to active memberships", () => {
    const member = { profileId: userId, membershipRole: "staff", status: "active", scopes: ["org:read"], expectedVersion: 0 };
    expect(membershipSchema.safeParse(member).success).toBe(false);
    expect(membershipSchema.safeParse({ ...member, status: "invited" }).success).toBe(true);
    expect(membershipSchema.safeParse({ ...member, expectedVersion: 2 }).success).toBe(true);
  });
  it("accepts only a positive version, never a caller-supplied invitee", () => {
    expect(acceptInviteSchema.safeParse({ expectedVersion: 1 }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ expectedVersion: 1, profileId: userId }).success).toBe(false);
  });
});
