import type { AmbulanceActor } from "@/modules/ambulance/types";
import type { CareActor } from "@/modules/caretaker/types";
import type { LabActor, LabStaffRole } from "@/modules/lab/types";

/**
 * Organization / workspace switcher logic for provider areas (FE spec 15:
 * "branch/vehicle/caregiver/technician membership selector ... never combined
 * cross-org results").
 *
 * A workspace is exactly one provider the signed-in person holds an ACTIVE
 * membership in. Screens always load data for one workspace; there is no
 * "all organizations" option. The server re-validates the membership on every
 * call; this module only decides what the UI offers and which actor shape the
 * module APIs receive.
 *
 * Membership roles follow I01 (`owner|manager|staff|billing`). Area scopes
 * (`lab:collector`, `lab:reviewer`, `ambulance:driver`, `care:caregiver`) are
 * PROPOSED names pending backend agreement (REQUESTS.md R-E08).
 */

export type ProviderArea = "lab" | "ambulance" | "caretaker";
export type MembershipRole = "owner" | "manager" | "staff" | "billing";
export type AreaScope = "lab:collector" | "lab:reviewer" | "ambulance:driver" | "care:caregiver";

export type WorkspaceMembership = {
  membershipId: string;
  profileId: string;
  providerId: string;
  /** Null for an individually owned provider (independent caregiver, sole operator). */
  organizationId: string | null;
  area: ProviderArea;
  displayName: string;
  membershipRole: MembershipRole;
  status: "invited" | "active" | "disabled";
  scopes: readonly string[];
  /** Person resource used for assignment-limited queues (collector, driver, caregiver). */
  resourceId: string | null;
};

export type Workspace = {
  key: string;
  area: ProviderArea;
  providerId: string;
  organizationId: string | null;
  displayName: string;
  profileId: string;
  membershipRole: MembershipRole;
  scopes: readonly AreaScope[];
  resourceId: string | null;
};

const AREAS: readonly ProviderArea[] = ["lab", "ambulance", "caretaker"];
const KNOWN_SCOPES = new Set<string>(["lab:collector", "lab:reviewer", "ambulance:driver", "care:caregiver"]);
const KEY_PATTERN = /^(lab|ambulance|caretaker):[A-Za-z0-9_-]{1,64}$/;

export const workspaceKey = (area: ProviderArea, providerId: string): string => `${area}:${providerId}`;

/** Cookie holding only the selected workspace key (provider id; no personal or health data). */
export const workspaceCookieName = (area: ProviderArea): string => `scv_ws_${area}`;

export function parseWorkspaceKey(raw: unknown): string | null {
  return typeof raw === "string" && KEY_PATTERN.test(raw) ? raw : null;
}

function toWorkspace(m: WorkspaceMembership): Workspace {
  return {
    key: workspaceKey(m.area, m.providerId),
    area: m.area,
    providerId: m.providerId,
    organizationId: m.organizationId,
    displayName: m.displayName,
    profileId: m.profileId,
    membershipRole: m.membershipRole,
    // Unknown scope strings are dropped, never interpreted.
    scopes: m.scopes.filter((s): s is AreaScope => KNOWN_SCOPES.has(s)),
    resourceId: m.resourceId,
  };
}

/** Active memberships only, one entry per provider, stable order. Never merges providers. */
export function listWorkspaces(memberships: readonly WorkspaceMembership[], area?: ProviderArea): Workspace[] {
  const seen = new Set<string>();
  const out: Workspace[] = [];
  for (const m of memberships) {
    if (m.status !== "active" || !AREAS.includes(m.area)) continue;
    if (area !== undefined && m.area !== area) continue;
    const ws = toWorkspace(m);
    if (seen.has(ws.key)) continue;
    seen.add(ws.key);
    out.push(ws);
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.key.localeCompare(b.key));
}

export type WorkspaceResolution =
  | { kind: "none" }
  | { kind: "selected"; workspace: Workspace; options: Workspace[] }
  | { kind: "choose"; options: Workspace[] };

/**
 * Picks the active workspace. A requested key must match an active membership.
 * With several workspaces and no valid selection the user must choose; the
 * UI never falls back to a combined view.
 */
export function resolveWorkspace(
  memberships: readonly WorkspaceMembership[],
  area: ProviderArea,
  requestedKey: unknown,
): WorkspaceResolution {
  const options = listWorkspaces(memberships, area);
  if (options.length === 0) return { kind: "none" };
  const key = parseWorkspaceKey(requestedKey);
  const match = key === null ? undefined : options.find((w) => w.key === key);
  if (match) return { kind: "selected", workspace: match, options };
  if (options.length === 1) return { kind: "selected", workspace: options[0], options };
  return { kind: "choose", options };
}

export type WorkspaceSwitch =
  | { ok: true; workspace: Workspace; cookie: { name: string; value: string }; clearClientState: true }
  | { ok: false; reason: "not_a_member" };

/**
 * Switching workspace: only to an active membership. The caller must set the
 * cookie, clear client caches/forms and refetch (switching invalidates all
 * previously loaded data).
 */
export function switchWorkspace(memberships: readonly WorkspaceMembership[], area: ProviderArea, targetKey: unknown): WorkspaceSwitch {
  const key = parseWorkspaceKey(targetKey);
  const target = key === null ? undefined : listWorkspaces(memberships, area).find((w) => w.key === key);
  if (!target) return { ok: false, reason: "not_a_member" };
  return { ok: true, workspace: target, cookie: { name: workspaceCookieName(area), value: target.key }, clearClientState: true };
}

/** Keeps only rows that belong to the active workspace's provider. */
export function scopeToWorkspace<T>(items: readonly T[], workspace: Workspace, providerOf: (item: T) => string): T[] {
  return items.filter((item) => providerOf(item) === workspace.providerId);
}

/** True when every row belongs to the active workspace (defence against a mixed server response). */
export function belongsToWorkspace<T>(items: readonly T[], workspace: Workspace, providerOf: (item: T) => string): boolean {
  return items.every((item) => providerOf(item) === workspace.providerId);
}

const isManagerRole = (role: MembershipRole) => role === "owner" || role === "manager";

/** Billing pages: owner, manager or billing membership. */
export const canSeeBilling = (ws: Workspace): boolean => isManagerRole(ws.membershipRole) || ws.membershipRole === "billing";

// ---------------------------------------------------------------------------
// Actor derivation for the module APIs
// ---------------------------------------------------------------------------

export function toLabActor(ws: Workspace): LabActor {
  const roles: LabStaffRole[] = [];
  if (isManagerRole(ws.membershipRole)) roles.push("manager");
  if (ws.scopes.includes("lab:collector")) roles.push("collector");
  if (ws.scopes.includes("lab:reviewer")) roles.push("reviewer");
  return { profileId: ws.profileId, providerId: ws.providerId, resourceId: ws.resourceId, membershipStatus: "active", roles };
}

export function toAmbulanceActor(ws: Workspace): AmbulanceActor {
  const roles: ("operator" | "driver")[] = [];
  if (isManagerRole(ws.membershipRole)) roles.push("operator");
  if (ws.scopes.includes("ambulance:driver")) roles.push("driver");
  return { profileId: ws.profileId, providerId: ws.providerId, resourceId: ws.resourceId, roles, membershipStatus: "active" };
}

export function toCareActor(ws: Workspace): CareActor {
  const base = { profileId: ws.profileId, providerId: ws.providerId, resourceId: ws.resourceId, membershipStatus: "active" as const };
  if (ws.organizationId === null) {
    // Individually owned provider: only the owner is the independent caregiver. Any other
    // membership (staff/billing) is limited to its own assignments, never provider-wide data.
    return ws.membershipRole === "owner"
      ? { ...base, kind: "independent", agencyId: null }
      : { ...base, kind: "agency_caregiver", agencyId: null };
  }
  if (isManagerRole(ws.membershipRole)) return { ...base, kind: "agency_manager", agencyId: ws.organizationId };
  return { ...base, kind: "agency_caregiver", agencyId: ws.organizationId };
}
