import type { Locale, Role } from "./roles";
import { homePath, isApprovalGatedRole, landingPathFor, onboardingPath, pendingApprovalPath, workspaceStateFor } from "./routes";
import type { Identity } from "./types";
import type { SessionLookup } from "./guard";

/**
 * Non-PHI account view for shared chrome (public header, operations workspaces).
 * Holds only what a header needs: never user IDs, email, phone, provider IDs, membership
 * details or tokens. Safe to pass to a client component as props.
 */
export type AccountSession =
  | { kind: "anonymous" }
  /** Session lookup failed: show the signed-out header; do not guess. */
  | { kind: "unavailable" }
  /** Account exists but is disabled: offer sign out only. */
  | { kind: "restricted" }
  | {
      kind: "signed_in";
      displayName: string;
      /** The role when the user has exactly one; null when they must pick a workspace. */
      role: Role | null;
      /** Distinct roles the user holds, in a stable order. */
      roles: Role[];
      /** Where "My workspace" should go: role dashboard, onboarding or workspace picker. */
      dashboardHref: string;
      /** One entry link per role the user may enter (fe-a PublicAccount.workspaces shape). */
      workspaces: { role: Role; href: string }[];
    };

const ROLE_ORDER: readonly Role[] = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"];
const MAX_DISPLAY_NAME = 60;

/** Entry link for one held role; null when the guard would not let the user in (non-active admin). */
function workspaceHref(identity: Identity, role: Role, locale: Locale): string | null {
  const state = workspaceStateFor(identity, role);
  if (state === null) return null;
  if (role === "admin") return state === "active" ? homePath(role, locale) : null;
  // A provider awaiting admin approval may reach only the waiting page, never the role dashboard.
  if (state === "pending_review" && isApprovalGatedRole(role)) return pendingApprovalPath(locale, role);
  return state === "onboarding_incomplete" || state === "unknown" ? onboardingPath(role, locale) : homePath(role, locale);
}

export function accountSessionView(lookup: Pick<SessionLookup, "session">, locale: Locale): AccountSession {
  if (!lookup.session.ok) return { kind: "unavailable" };
  const session = lookup.session.data;
  if (session.kind === "anonymous") return { kind: "anonymous" };
  if (session.kind === "restricted") return { kind: "restricted" };
  const { identity } = session;
  const held = new Set(identity.workspaces.map((w) => w.role));
  const roles = ROLE_ORDER.filter((r) => held.has(r));
  return {
    kind: "signed_in",
    displayName: identity.displayName.trim().slice(0, MAX_DISPLAY_NAME),
    role: roles.length === 1 ? roles[0] : null,
    roles,
    dashboardHref: landingPathFor(identity, locale),
    workspaces: roles.flatMap((role) => {
      const href = workspaceHref(identity, role, locale);
      return href ? [{ role, href }] : [];
    }),
  };
}
