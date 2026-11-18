/**
 * Scoped admin capability model. Deny by default.
 *
 * This is a UI-side mirror of the server rule so screens can render a denied
 * state. It is never the only guard: the server re-checks every route and
 * mutation (I01 `admin_capabilities`).
 */

/** Capabilities that exist in the I01 migration (`admin_capabilities.capability`). */
export const BACKEND_ADMIN_CAPABILITIES = [
  "provider:verify",
  "coverage:verify",
  "security:audit",
  "membership:admin",
] as const;

/**
 * Proposed capabilities needed by FE spec section 15 that the backend does not
 * define yet (logged in docs/frontend/REQUESTS.md). Until the server grants
 * them, real principals never hold them, so these areas stay denied.
 */
export const PROPOSED_ADMIN_CAPABILITIES = [
  "booking:operate",
  "payment:read",
  "refund:approve",
  "support:operate",
  "settings:read",
  "content:edit",
  "content:publish",
] as const;

export const ADMIN_CAPABILITIES = [...BACKEND_ADMIN_CAPABILITIES, ...PROPOSED_ADMIN_CAPABILITIES] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export type AdminScope = { kind: "global" } | { kind: "organization"; organizationId: string };

export type AdminGrant = {
  capability: AdminCapability;
  scope: AdminScope;
  grantedAt: string;
  /** UTC ISO; null means no expiry set by the server. */
  expiresAt: string | null;
  revokedAt: string | null;
};

export type AdminPrincipalStatus = "invited" | "active" | "suspended" | "revoked";

export type AdminPrincipal = {
  profileId: string;
  status: AdminPrincipalStatus;
  /** Server-asserted MFA for this session. Never derived on the client. */
  mfaVerified: boolean;
  grants: readonly AdminGrant[];
};

export type CapabilityContext = {
  /** When set, the action targets records of this organization. */
  organizationId?: string;
  now?: Date;
};

const KNOWN = new Set<string>(ADMIN_CAPABILITIES);

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === "string" && KNOWN.has(value);
}

function grantIsLive(grant: AdminGrant, now: Date): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.expiresAt === null) return true;
  const expires = Date.parse(grant.expiresAt);
  // Unparseable expiry fails closed.
  return Number.isFinite(expires) && expires > now.getTime();
}

function scopeCovers(scope: AdminScope, organizationId: string | undefined): boolean {
  if (scope.kind === "global") return true;
  // An organization-scoped grant only applies when the target organization is known and matches.
  return organizationId !== undefined && scope.organizationId === organizationId;
}

/**
 * Pure capability check. Returns true only when every condition holds:
 * principal present and active, MFA verified, known capability, and a live
 * grant whose scope covers the target.
 */
export function can(
  admin: AdminPrincipal | null | undefined,
  capability: AdminCapability | string,
  context: CapabilityContext = {},
): boolean {
  if (!admin) return false;
  if (admin.status !== "active") return false;
  if (admin.mfaVerified !== true) return false;
  if (!isAdminCapability(capability)) return false;
  const now = context.now ?? new Date();
  return admin.grants.some(
    (grant) =>
      grant.capability === capability && grantIsLive(grant, now) && scopeCovers(grant.scope, context.organizationId),
  );
}

/** Capabilities the principal can use at global scope right now (for navigation only). */
export function globalCapabilities(admin: AdminPrincipal | null | undefined, now: Date = new Date()): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((capability) => can(admin, capability, { now }));
}
