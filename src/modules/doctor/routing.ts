import type { ApiErrorCode, ApiResult } from "@/lib/api/result";

/**
 * Route helpers for /[locale]/doctor/**: route param validation, page-state mapping and
 * guard decisions. ADVISORY ONLY: the server and DB enforce authorization independently.
 *
 * TEMPORARY: once src/modules/auth (requireRole, loginPath, safeRedirect) is merged into this
 * branch the doctor layout must call requireRole and GuardResult/decideDoctorAccess/loginRedirect
 * are deleted (XREVIEW-b D4). Until then the decision mirrors requireRole: login with safe next
 * (+ reason=session_expired), onboarding redirect, restricted allow-list, denied page.
 */
export const DOCTOR_LOCALES = ["en", "te", "hi"] as const;
export type DoctorLocale = (typeof DOCTOR_LOCALES)[number];
export const isDoctorLocale = (v: unknown): v is DoctorLocale => typeof v === "string" && (DOCTOR_LOCALES as readonly string[]).includes(v);

/** Server IDs are opaque UUID-like or synthetic fixture IDs. Anything else is a 404, never a fetch. */
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
export function parseRouteId(raw: unknown): string | null {
  return typeof raw === "string" && ROUTE_ID.test(raw) ? raw : null;
}

export function doctorPaths(locale: DoctorLocale) {
  const root = `/${locale}/doctor`;
  return {
    dashboard: `${root}/dashboard`,
    requests: `${root}/requests`,
    request: (id: string) => `${root}/requests/${encodeURIComponent(id)}`,
    visits: `${root}/visits`,
    visit: (id: string) => `${root}/visits/${encodeURIComponent(id)}`,
    consultation: (bookingId: string) => `${root}/visits/${encodeURIComponent(bookingId)}/consultation`,
    records: `${root}/records`,
    record: (consultationId: string) => `${root}/records/${encodeURIComponent(consultationId)}`,
    availability: `${root}/availability`,
    services: `${root}/services`,
    profile: `${root}/profile`,
    earnings: `${root}/earnings`,
    support: `${root}/support`,
    settings: `${root}/settings`,
  } as const;
}

// ---- Page state -----------------------------------------------------------------------------
export type PageState<T> =
  | { kind: "ready"; data: T }
  | { kind: "empty" }
  | { kind: "unauthenticated" }
  | { kind: "denied" }
  | { kind: "not_found" }
  | { kind: "gated" }
  | { kind: "error"; code: ApiErrorCode; retryable: boolean; retryAfterSeconds?: number };

const RETRYABLE: ReadonlySet<ApiErrorCode> = new Set(["unavailable", "rate_limited", "conflict"]);

/**
 * Map an ApiResult to what the page renders. Forbidden and privacy-safe 404 both become
 * "denied"/"not_found" without exposing whether the resource exists for someone else.
 */
export function toPageState<T>(result: ApiResult<T>, isEmpty?: (data: T) => boolean): PageState<T> {
  if (result.ok) return isEmpty?.(result.data) ? { kind: "empty" } : { kind: "ready", data: result.data };
  const { code, retryAfterSeconds } = result.error;
  switch (code) {
    case "unauthenticated":
      return { kind: "unauthenticated" };
    case "forbidden":
      return { kind: "denied" };
    case "not_found":
      return { kind: "not_found" };
    case "gated":
      return { kind: "gated" };
    default:
      return { kind: "error", code, retryable: RETRYABLE.has(code), ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
  }
}

// ---- Guard decision -------------------------------------------------------------------------
export type GuardResult =
  | { status: "ok" }
  | { status: "unauthenticated"; sessionExpired?: boolean }
  /** Doctor onboarding draft/submitted/changes-requested: setup pages only (section 8). */
  | { status: "onboarding_required" }
  /** Signed in but not a doctor (or no active doctor workspace). */
  | { status: "forbidden" }
  /** Doctor workspace suspended/restricted: only dashboard/profile/settings/support. */
  | { status: "restricted" };

export type GuardDecision = { action: "render" } | { action: "redirect"; to: string } | { action: "denied"; reason: "forbidden" | "restricted" };

/** Mirrors fe2-b RESTRICTED_SEGMENTS (src/modules/auth/routes.ts) so the lists do not drift. */
const RESTRICTED_ALLOWED = new Set(["dashboard", "profile", "settings", "support", "notifications"]);
/** Setup pages an incomplete doctor workspace may open (fe2-b SETUP_SEGMENTS minus onboarding itself). */
const SETUP_ALLOWED = new Set(["dashboard", "onboarding", "profile", "settings", "support", "notifications"]);
const SAFE_PATH = /^\/(en|te|hi)\/doctor(\/[A-Za-z0-9_-]+)*$/;

/** `next` is kept only if it is a plain internal doctor path (no query, no fragment, no PHI). */
export function loginRedirect(locale: DoctorLocale, currentPath: string, sessionExpired = false): string {
  const next = SAFE_PATH.test(currentPath) ? currentPath : doctorPaths(locale).dashboard;
  return `/${locale}/login?next=${encodeURIComponent(next)}${sessionExpired ? "&reason=session_expired" : ""}`;
}

/** Section after /{locale}/doctor/, or null when the path is not a plain doctor path (fails closed). */
function doctorSection(currentPath: string): string | null {
  return SAFE_PATH.test(currentPath) ? (currentPath.split("/")[3] ?? "dashboard") : null;
}

export function decideDoctorAccess(guard: GuardResult, locale: DoctorLocale, currentPath: string): GuardDecision {
  if (guard.status === "ok") return { action: "render" };
  if (guard.status === "unauthenticated") return { action: "redirect", to: loginRedirect(locale, currentPath, guard.sessionExpired) };
  if (guard.status === "forbidden") return { action: "denied", reason: "forbidden" };
  const section = doctorSection(currentPath);
  if (guard.status === "onboarding_required") {
    return section !== null && SETUP_ALLOWED.has(section) ? { action: "render" } : { action: "redirect", to: `/${locale}/doctor/onboarding` };
  }
  return section !== null && RESTRICTED_ALLOWED.has(section) ? { action: "render" } : { action: "denied", reason: "restricted" };
}
