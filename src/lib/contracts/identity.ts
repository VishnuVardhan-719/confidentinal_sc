import { z } from "zod";

/** Shared request/response shapes for I01 identity and organization commands (contract v0). */

export const membershipRoles = [
  "owner",
  "manager",
  "doctor",
  "technician",
  "driver",
  "caregiver",
  "billing",
] as const;
export const membershipStatuses = ["invited", "active", "disabled"] as const;

export const MembershipRole = z.enum(membershipRoles);
export const MembershipStatus = z.enum(membershipStatuses);

export const CreateOrganizationInput = z.object({
  displayName: z.string().trim().min(2).max(120),
});

export const AcceptInviteInput = z.object({
  organizationId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInput>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteInput>;
