import type { AdapterMode } from "@/lib/api/mode";
import type { ApiErrorCode, ApiResult } from "@/lib/api/result";
import { can, type AdminCapability, type AdminPrincipal } from "./capabilities";
import { resolveWorkspace, type ProviderArea, type Workspace, type WorkspaceMembership } from "./workspace";

/**
 * Route guard decisions and loader results for the lab, ambulance, caretaker
 * and admin areas.
 *
 * These are pure decisions. Route layouts call the auth module's server guard
 * (`requireRole`, src/modules/auth, owned by another agent) for the session,
 * then use these functions to decide redirect / denied / choose-workspace /
 * allowed. Hiding UI is never the only guard: every API call is re-authorized
 * by the server.
 */

export const APP_LOCALES = ["en", "te", "hi"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const isAppLocale = (value: unknown): value is AppLocale =>
  typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);

/**
 * Builds `/{locale}/login?next=...` with an internal, locale-prefixed path only.
 * Query strings and fragments are dropped (no PHI in URLs); anything that is
 * not a safe internal path falls back to the locale home.
 */
export function loginRedirectPath(locale: AppLocale, nextPath: string): string {
  return `/${locale}/login?next=${encodeURIComponent(safeInternalPath(locale, nextPath))}`;
}

export function safeInternalPath(locale: AppLocale, path: string): string {
  const bare = path.split(/[?#]/, 1)[0] ?? "";
  const ok =
    /^\/(en|te|hi)(\/[A-Za-z0-9_-]+)*\/?$/.test(bare) && !bare.includes("//") && !bare.includes("..");
  return ok ? bare : `/${locale}`;
}

// ---------------------------------------------------------------------------
// Provider areas (workspace based)
// ---------------------------------------------------------------------------

/** The minimal session view the guard needs. Supplied by the auth module's server session. */
export type GuardSession = { profileId: string; memberships: readonly WorkspaceMembership[] } | null;

export type AreaAccess =
  | { kind: "unauthenticated"; loginPath: string }
  | { kind: "denied" }
  | { kind: "choose_workspace"; options: Workspace[] }
  | { kind: "allowed"; workspace: Workspace; options: Workspace[] };

export function decideWorkspaceAccess(input: {
  session: GuardSession;
  area: ProviderArea;
  requestedWorkspaceKey: unknown;
  locale: AppLocale;
  path: string;
  permits: (workspace: Workspace) => boolean;
}): AreaAccess {
  if (!input.session) return { kind: "unauthenticated", loginPath: loginRedirectPath(input.locale, input.path) };
  const own = input.session.memberships.filter((m) => m.profileId === input.session?.profileId);
  const resolved = resolveWorkspace(own, input.area, input.requestedWorkspaceKey);
  if (resolved.kind === "none") return { kind: "denied" };
  if (resolved.kind === "choose") return { kind: "choose_workspace", options: resolved.options };
  return input.permits(resolved.workspace)
    ? { kind: "allowed", workspace: resolved.workspace, options: resolved.options }
    : { kind: "denied" };
}

// ---------------------------------------------------------------------------
// Admin area (capability based)
// ---------------------------------------------------------------------------

export type AdminAccess =
  | { kind: "unauthenticated"; loginPath: string }
  | { kind: "denied" }
  | { kind: "allowed"; principal: AdminPrincipal };

export function decideAdminAccess(input: {
  principal: AdminPrincipal | null;
  /** Any one of these capabilities grants the route. Empty list = denied. */
  anyOf: readonly AdminCapability[];
  locale: AppLocale;
  path: string;
  now?: Date;
  /** Some routes (audit) also accept organization-scoped grants. */
  orgScopedOk?: boolean;
}): AdminAccess {
  if (!input.principal) return { kind: "unauthenticated", loginPath: loginRedirectPath(input.locale, input.path) };
  const now = input.now ?? new Date();
  const principal = input.principal;
  const allowed = input.anyOf.some(
    (cap) =>
      can(principal, cap, { now }) ||
      (input.orgScopedOk === true &&
        principal.grants.some(
          (g) => g.capability === cap && g.scope.kind === "organization" && can(principal, cap, { organizationId: g.scope.organizationId, now }),
        )),
  );
  return allowed ? { kind: "allowed", principal } : { kind: "denied" };
}

// ---------------------------------------------------------------------------
// Loader results: what a route renders. Errors never become zero or empty.
// ---------------------------------------------------------------------------

export type LoaderResult<T> =
  | { status: "ok"; data: T; fixture: boolean }
  | { status: "empty"; fixture: boolean }
  | { status: "denied" }
  | { status: "not_found" }
  | { status: "gated" }
  | { status: "unauthenticated" }
  | { status: "error"; code: ApiErrorCode; retryAfterSeconds?: number };

export function toLoaderResult<T>(result: ApiResult<T>, mode: AdapterMode, isEmpty: (data: T) => boolean = () => false): LoaderResult<T> {
  const fixture = mode === "fixture";
  if (result.ok) return isEmpty(result.data) ? { status: "empty", fixture } : { status: "ok", data: result.data, fixture };
  switch (result.error.code) {
    case "forbidden":
      return { status: "denied" };
    case "not_found":
      return { status: "not_found" };
    case "gated":
      return { status: "gated" };
    case "unauthenticated":
      return { status: "unauthenticated" };
    default:
      return result.error.retryAfterSeconds === undefined
        ? { status: "error", code: result.error.code }
        : { status: "error", code: result.error.code, retryAfterSeconds: result.error.retryAfterSeconds };
  }
}

/** Context every provider-area loader receives once the route guard allowed the request. */
export type WorkspaceLoaderContext = {
  workspace: Workspace;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

/** Context for admin loaders. */
export type AdminLoaderContext = {
  principal: AdminPrincipal;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

/** Metric shown on dashboards: a real number, a lower bound (more pages exist), or unavailable. Never a fake zero. */
export type Metric =
  | { kind: "value"; value: number; lowerBound: boolean }
  | { kind: "unavailable"; reason: "gated" | "denied" | "error" };

export function metricFrom<T>(result: ApiResult<{ items: T[]; nextCursor: string | null } | T[]>, count?: (items: T[]) => number): Metric {
  if (!result.ok) {
    const code = result.error.code;
    return { kind: "unavailable", reason: code === "gated" ? "gated" : code === "forbidden" ? "denied" : "error" };
  }
  const data = result.data;
  const items = Array.isArray(data) ? data : data.items;
  const more = Array.isArray(data) ? false : data.nextCursor !== null;
  return { kind: "value", value: count ? count(items) : items.length, lowerBound: more };
}
