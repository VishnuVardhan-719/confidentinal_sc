import { z } from "zod";

/**
 * Organization membership vocabulary, aligned with I01 (`organization_members`).
 * docs/specs/ROLE_ONBOARDING_AND_PERMISSIONS.md lists doctor/technician/driver/caregiver roles;
 * I01 collapses them into `staff`. Mismatch recorded in docs/frontend/REQUESTS.md.
 */
export const MEMBERSHIP_ROLES = ["owner", "manager", "staff", "billing"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);

export const MEMBERSHIP_STATUSES = ["invited", "active", "disabled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

export const ORGANIZATION_SCOPES = [
  "org:read",
  "org:edit",
  "members:read",
  "provider:read",
  "provider:manage",
  "evidence:manage",
  "schedule:manage",
  "finance:read",
] as const;
export type OrganizationScope = (typeof ORGANIZATION_SCOPES)[number];
export const organizationScopeSchema = z.enum(ORGANIZATION_SCOPES);

/** A membership as the UI sees it. Display only: the server re-checks membership on every request. */
export const membershipViewSchema = z.strictObject({
  organizationId: z.uuid(),
  organizationName: z.string().trim().min(1).max(160),
  membershipRole: membershipRoleSchema,
  status: membershipStatusSchema,
  scopes: z
    .array(organizationScopeSchema)
    .max(ORGANIZATION_SCOPES.length)
    .refine((s) => new Set(s).size === s.length, { message: "duplicate_scope" }),
});
export type MembershipView = z.infer<typeof membershipViewSchema>;

/** Only an active membership can act; invited/disabled memberships are informational. */
export const isActiveMembership = (m: Pick<MembershipView, "status">): boolean => m.status === "active";

export const hasScope = (m: Pick<MembershipView, "status" | "scopes">, scope: OrganizationScope): boolean =>
  isActiveMembership(m) && m.scopes.includes(scope);
