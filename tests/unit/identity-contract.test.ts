import { describe, expect, it } from "vitest";
import { AcceptInviteInput, CreateOrganizationInput, MembershipRole } from "@/lib/contracts/identity";

describe("identity contract", () => {
  it("accepts a valid organization name and trims it", () => {
    expect(CreateOrganizationInput.parse({ displayName: "  Example Org  " }).displayName).toBe("Example Org");
  });
  it("rejects empty or oversized organization names", () => {
    expect(CreateOrganizationInput.safeParse({ displayName: " " }).success).toBe(false);
    expect(CreateOrganizationInput.safeParse({ displayName: "x".repeat(121) }).success).toBe(false);
  });
  it("rejects unknown membership roles", () => {
    expect(MembershipRole.safeParse("admin").success).toBe(false);
    expect(MembershipRole.safeParse("owner").success).toBe(true);
  });
  it("requires a uuid and a positive version to accept an invite", () => {
    expect(AcceptInviteInput.safeParse({ organizationId: "nope", expectedVersion: 1 }).success).toBe(false);
    expect(AcceptInviteInput.safeParse({ organizationId: crypto.randomUUID(), expectedVersion: 0 }).success).toBe(false);
  });
});
