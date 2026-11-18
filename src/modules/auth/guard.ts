import type { ApiResult } from "@/lib/api/result";
import type { Locale, Role } from "./roles";
import { canAccessRoute, homePath, landingPathFor, loginPath, workspaceStateFor } from "./routes";
import { normalizeInternalPath } from "./redirect";
import type { Identity, Session, Workspace } from "./types";

/**
 * Pure decision behind requireRole()/requireSession() in server.ts. Kept free of
 * next/* imports so it is unit-testable. The DB/API still authorize every read and write.
 */

export type DeniedReason = "forbidden" | "account_restricted" | "unavailable";

export type RoleAccess =
  | { kind: "allowed"; identity: Identity; workspaces: Workspace[] }
  | { kind: "denied"; reason: DeniedReason };

export type GuardOutcome = RoleAccess | { kind: "redirect"; to: string };

export type SessionAccess =
  | { kind: "allowed"; identity: Identity }
  | { kind: "denied"; reason: DeniedReason };

export type SessionLookup = { session: ApiResult<Session>; hadSession: boolean };

/** Use `path` only if it is internal and inside the expected root; otherwise the root's default. */
function pathWithin(root: string, path: string | undefined, fallback: string): string {
  const normalized = normalizeInternalPath(path);
  if (normalized === null) return fallback;
  const pathname = normalized.split(/[?#]/)[0];
  return pathname === root || pathname.startsWith(`${root}/`) ? normalized : fallback;
}

export function decideRoleAccess(input: SessionLookup & { role: Role; locale: Locale; path?: string }): GuardOutcome {
  const { role, locale } = input;
  if (!input.session.ok) return { kind: "denied", reason: "unavailable" };
  const session = input.session.data;
  const path = pathWithin(`/${locale}/${role}`, input.path, homePath(role, locale));
  const decision = canAccessRoute(session, path);
  if (decision.allowed) {
    if (session.kind !== "authenticated") return { kind: "denied", reason: "forbidden" };
    return {
      kind: "allowed",
      identity: session.identity,
      workspaces: session.identity.workspaces.filter((w) => w.role === role),
    };
  }
  switch (decision.reason) {
    case "unauthenticated":
      return { kind: "redirect", to: loginPath(locale, path, input.hadSession ? "session_expired" : undefined) };
    case "onboarding_required":
    case "workspace_restricted":
      return decision.redirectTo ? { kind: "redirect", to: decision.redirectTo } : { kind: "denied", reason: "forbidden" };
    case "account_restricted":
      return { kind: "denied", reason: "account_restricted" };
    default:
      // Wrong role (no workspace of this role at all): send the user to their own landing
      // page. It never points back into `role`, so this cannot loop, and it reveals nothing
      // about the requested area. A workspace that exists but is not usable stays denied.
      if (session.kind === "authenticated" && workspaceStateFor(session.identity, role) === null) {
        return { kind: "redirect", to: landingPathFor(session.identity, locale) };
      }
      return { kind: "denied", reason: "forbidden" };
  }
}

/** For shared private routes (/workspace/*, /account/*): any unrestricted signed-in user. */
export function decideSessionAccess(
  input: SessionLookup & { locale: Locale; path?: string },
): SessionAccess | { kind: "redirect"; to: string } {
  if (!input.session.ok) return { kind: "denied", reason: "unavailable" };
  const session = input.session.data;
  const fallback = `/${input.locale}/account/security`;
  const path = normalizeInternalPath(input.path) ?? fallback;
  if (session.kind === "anonymous") {
    return { kind: "redirect", to: loginPath(input.locale, path, input.hadSession ? "session_expired" : undefined) };
  }
  if (session.kind === "restricted") return { kind: "denied", reason: "account_restricted" };
  return { kind: "allowed", identity: session.identity };
}
