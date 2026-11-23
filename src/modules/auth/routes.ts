import { isLocale, ROLES, type Locale, type Role } from "./roles";
import { normalizeInternalPath } from "./redirect";
import type { Identity, Session, Workspace, WorkspaceState } from "./types";

/**
 * UI-side route guard and home routing. PURE and ADVISORY: every page, route handler and
 * DB policy must still enforce authorization server-side. Hiding UI is never the guard.
 */

export const DEFAULT_LOCALE: Locale = "en";

/** Role-relative home route (FRONTEND_MASTER section 5 private route map). */
export const ROLE_HOME_PATH: Readonly<Record<Role, `/${Role}/dashboard`>> = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  lab: "/lab/dashboard",
  ambulance: "/ambulance/dashboard",
  caretaker: "/caretaker/dashboard",
  admin: "/admin/dashboard",
};

export const homePath = (role: Role, locale: Locale = DEFAULT_LOCALE): string => `/${locale}${ROLE_HOME_PATH[role]}`;

/** Admin has no self-onboarding (invite-only); its "onboarding" is its dashboard. */
export const onboardingPath = (role: Role, locale: Locale = DEFAULT_LOCALE): string =>
  role === "admin" ? homePath(role, locale) : `/${locale}/${role}/onboarding`;

export const LOGIN_REASONS = ["session_expired", "signed_out"] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

export function loginPath(locale: Locale = DEFAULT_LOCALE, next?: string, reason?: LoginReason): string {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/${locale}/login?${query}` : `/${locale}/login`;
}

export const workspaceSelectPath = (locale: Locale = DEFAULT_LOCALE): string => `/${locale}/workspace/select`;

/**
 * Provider approval gate: a doctor, lab, ambulance or caretaker whose application is awaiting the admin
 * sees only "your request has been sent to the admin" until it is approved. Patients and admins never
 * use it. `role` only tailors the wording; it grants nothing.
 */
const APPROVAL_GATED_ROLES: readonly Role[] = ["doctor", "lab", "ambulance", "caretaker"];
export const isApprovalGatedRole = (role: Role): boolean => APPROVAL_GATED_ROLES.includes(role);
export const pendingApprovalPath = (locale: Locale = DEFAULT_LOCALE, role?: Role): string =>
  role && isApprovalGatedRole(role) ? `/${locale}/workspace/pending?role=${role}` : `/${locale}/workspace/pending`;

/** Private routes outside role roots that need any authenticated, unrestricted session. */
const SHARED_PRIVATE_ROOTS = new Set(["workspace", "account"]);

/** Subpaths a non-active workspace may still open (setup dashboard, status, support). */
const SETUP_SEGMENTS = new Set(["dashboard", "onboarding", "profile", "settings", "support", "notifications"]);
/** Suspended/restricted workspaces: no onboarding edits; status, support and settings only. */
const RESTRICTED_SEGMENTS = new Set(["dashboard", "profile", "settings", "support", "notifications"]);
/** Patient data-entry pages that belong to the questionnaire itself. */
const PATIENT_SETUP_EXTRA = new Set(["health-profile", "family", "addresses", "documents"]);

export type AccessDenialReason =
  | "invalid_path"
  | "unauthenticated"
  | "account_restricted"
  | "forbidden"
  | "onboarding_required"
  | "workspace_restricted";

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: AccessDenialReason; redirectTo: string | null };

type ParsedPath = { locale: Locale; segments: string[]; path: string };

function parsePath(path: string): ParsedPath | null {
  const normalized = normalizeInternalPath(path);
  if (normalized === null) return null;
  const pathname = new URL(normalized, "https://internal.invalid").pathname;
  let segments: string[];
  try {
    segments = pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    return null;
  }
  let locale = DEFAULT_LOCALE;
  const first = segments[0];
  if (isLocale(first)) {
    locale = first;
    segments = segments.slice(1);
  }
  return { locale, segments, path: normalized };
}

const STATE_RANK: Record<WorkspaceState, number> = {
  active: 4,
  pending_review: 3,
  onboarding_incomplete: 2,
  unknown: 1,
  restricted: 0,
};

/** Best state across all workspaces of a role (a user may hold e.g. two lab memberships). */
export function workspaceStateFor(identity: Identity, role: Role): WorkspaceState | null {
  const matches = identity.workspaces.filter((w) => w.role === role);
  if (matches.length === 0) return null;
  return matches.reduce<Workspace>((best, w) => (STATE_RANK[w.state] > STATE_RANK[best.state] ? w : best), matches[0]).state;
}

const isRoleSegment = (value: string | undefined): value is Role =>
  value !== undefined && (ROLES as readonly string[]).includes(value);

export function canAccessRoute(session: Session, path: string): AccessDecision {
  const parsed = parsePath(path);
  if (parsed === null) return { allowed: false, reason: "invalid_path", redirectTo: null };
  const { locale, segments } = parsed;
  const root = segments[0];

  const isWorkspaceRoute = isRoleSegment(root);
  const isSharedPrivate = root !== undefined && SHARED_PRIVATE_ROOTS.has(root);
  if (!isWorkspaceRoute && !isSharedPrivate) return { allowed: true };

  if (session.kind === "anonymous") {
    return { allowed: false, reason: "unauthenticated", redirectTo: loginPath(locale, parsed.path) };
  }
  if (session.kind === "restricted") {
    return { allowed: false, reason: "account_restricted", redirectTo: null };
  }
  if (!isWorkspaceRoute) return { allowed: true };

  const role = root;
  const state = workspaceStateFor(session.identity, role);
  // A signed-in user may open a provider category's onboarding to START an application;
  // the server authorizes provider creation. Nothing private is reachable this way.
  if (state === null && role !== "patient" && role !== "admin" && (segments[1] ?? "") === "onboarding") {
    return { allowed: true };
  }
  // No workspace: minimal denial without hinting whether anything exists there.
  if (state === null) return { allowed: false, reason: "forbidden", redirectTo: null };
  if (state === "active") return { allowed: true };
  if (role === "admin") return { allowed: false, reason: "forbidden", redirectTo: null };

  // Awaiting admin approval: no dashboard and no other workspace page, only the "request sent" message.
  if (state === "pending_review" && isApprovalGatedRole(role)) {
    return { allowed: false, reason: "workspace_restricted", redirectTo: pendingApprovalPath(locale, role) };
  }

  const sub = segments[1] ?? "dashboard";
  if (state === "restricted") {
    return RESTRICTED_SEGMENTS.has(sub)
      ? { allowed: true }
      : { allowed: false, reason: "workspace_restricted", redirectTo: homePath(role, locale) };
  }
  if (SETUP_SEGMENTS.has(sub) || (role === "patient" && PATIENT_SETUP_EXTRA.has(sub))) return { allowed: true };
  if (state === "pending_review") {
    return { allowed: false, reason: "workspace_restricted", redirectTo: homePath(role, locale) };
  }
  return { allowed: false, reason: "onboarding_required", redirectTo: onboardingPath(role, locale) };
}

/** Where a signed-in identity lands when no (valid) return path was requested. */
export function landingPathFor(identity: Identity, locale: Locale = DEFAULT_LOCALE): string {
  const roles = [...new Set(identity.workspaces.map((w) => w.role))];
  if (roles.length !== 1) return workspaceSelectPath(locale);
  const role = roles[0];
  const state = workspaceStateFor(identity, role);
  // A non-active admin has no admin route the guard allows; send them to their own account page.
  if (role === "admin" && state !== "active") return `/${locale}/account/security`;
  if (state === "pending_review" && isApprovalGatedRole(role)) return pendingApprovalPath(locale, role);
  if (state === "onboarding_incomplete" || state === "unknown") return onboardingPath(role, locale);
  return homePath(role, locale);
}

const AUTH_PAGES = new Set(["login", "signup"]);

/**
 * Post-login destination: the requested path only if it is internal, not an auth page and
 * allowed for this session; otherwise the identity's landing path.
 */
export function resolvePostAuthRedirect(identity: Identity, requested: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const landing = landingPathFor(identity, locale);
  if (typeof requested !== "string") return landing;
  const parsed = parsePath(requested);
  if (parsed === null || AUTH_PAGES.has(parsed.segments[0] ?? "")) return landing;
  const decision = canAccessRoute({ kind: "authenticated", identity }, parsed.path);
  return decision.allowed ? parsed.path : landing;
}
