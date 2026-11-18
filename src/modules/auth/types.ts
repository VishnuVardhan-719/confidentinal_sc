import { z } from "zod";
import { localeSchema, roleSchema } from "./roles";
import { membershipViewSchema } from "@/modules/organizations/types";
import { PROVIDER_STATUSES } from "@/modules/verification/status";

/**
 * Workspace state as the UI understands it. Server enforces; this only routes and renders.
 * - active: full workspace
 * - onboarding_incomplete: required onboarding sections missing
 * - pending_review: provider submitted, awaiting admin decision
 * - restricted: suspended/expired/rejected or otherwise limited by server
 * - unknown: server did not report enough to decide; treated like incomplete (fail closed)
 */
export const WORKSPACE_STATES = ["active", "onboarding_incomplete", "pending_review", "restricted", "unknown"] as const;
export type WorkspaceState = (typeof WORKSPACE_STATES)[number];
export const workspaceStateSchema = z.enum(WORKSPACE_STATES);

export const workspaceSchema = z.strictObject({
  role: roleSchema,
  state: workspaceStateSchema,
  /** Provider entity this workspace operates, when known. */
  providerId: z.uuid().optional(),
  providerStatus: z.enum([...PROVIDER_STATUSES, "unknown"] as const).optional(),
  /** Present when the workspace is reached through an organization membership. */
  membership: membershipViewSchema.optional(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const identitySchema = z.strictObject({
  userId: z.uuid(),
  displayName: z.string().max(100),
  locale: localeSchema,
  workspaces: z.array(workspaceSchema).max(50),
});
export type Identity = z.infer<typeof identitySchema>;

export const SESSION_RESTRICTIONS = ["account_disabled"] as const;
export type SessionRestriction = (typeof SESSION_RESTRICTIONS)[number];

/** Session view model. `restricted` means the account exists but may not use private workspaces. */
export const sessionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("anonymous") }),
  z.strictObject({ kind: z.literal("restricted"), reason: z.enum(SESSION_RESTRICTIONS) }),
  z.strictObject({ kind: z.literal("authenticated"), identity: identitySchema }),
]);
export type Session = z.infer<typeof sessionSchema>;

/**
 * Bearer tokens returned by I01 `/api/auth/login` and `/refresh`.
 * SERVER-ONLY: store in an httpOnly cookie; never pass to client components,
 * localStorage, logs or analytics. See docs/frontend/REQUESTS.md (cookie session request).
 */
export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds, from the server. */
  expiresAt: number | null;
};
