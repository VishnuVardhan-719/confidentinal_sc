import { z } from "zod";

export const workspaceRoles = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export const organizationScopes = ["org:read", "org:edit", "members:read", "provider:read", "provider:manage", "evidence:manage", "schedule:manage", "finance:read"] as const;
export const credentialsSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});
// Existing Auth accounts may predate the signup password policy.
export const loginSchema = credentialsSchema.extend({ password: z.string().min(1).max(128) });
export const refreshSchema = z.strictObject({ refreshToken: z.string().min(1).max(8192) });
export const profilePatchSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(100),
  locale: z.enum(["en", "te", "hi"]),
  expectedVersion: z.int().positive(),
});
export const organizationCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(160) });
export const organizationPatchSchema = organizationCreateSchema.extend({ expectedVersion: z.int().positive() });
export const membershipSchema = z.strictObject({
  profileId: z.uuid(),
  membershipRole: z.enum(["manager", "staff", "billing"]),
  status: z.enum(["invited", "active", "disabled"]),
  scopes: z.array(z.enum(organizationScopes)).max(organizationScopes.length).refine((s) => new Set(s).size === s.length),
  // Zero creates a new membership; positive values compare existing versions.
  expectedVersion: z.int().nonnegative(),
}).refine((value) => value.expectedVersion !== 0 || value.status === "invited", {
  message: "New members must be invited", path: ["status"],
});
export const acceptInviteSchema = z.strictObject({ expectedVersion: z.int().positive() });
export const selfPatientSchema = z.strictObject({ policyVersion: z.string().trim().min(1).max(80), consent: z.literal(true) });


export const listQuerySchema = z.strictObject({
  limit: z.string().regex(/^[0-9]{1,2}$/).transform(Number).pipe(z.int().min(1).max(50)).default(20),
  cursor: z.uuid().optional(),
});
