import type { ApiErrorCode, ApiResult } from "@/lib/api/result";

/**
 * Route helpers for /[locale]/doctor/**: route param validation, page-state mapping and
 * guard decisions. ADVISORY ONLY: the server and DB enforce authorization independently.
 *
 * TEMPORARY: once src/modules/auth (requireRole, loginPath, safeRedirect) is merged into this
 * branch the guard adapter in the doctor layout should call it; this file keeps the decision
 * logic pure so it can be tested without the auth module.
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
  | { status: "unauthenticated" }
  /** Signed in but not a doctor (or no active doctor workspace). */
  | { status: "forbidden" }
  /** Doctor workspace suspended/restricted: only dashboard/profile/settings/support. */
  | { status: "restricted" };

export type GuardDecision = { action: "render" } | { action: "redirect"; to: string } | { action: "denied"; reason: "forbidden" | "restricted" };

const RESTRICTED_ALLOWED = new Set(["dashboard", "profile", "settings", "support"]);
const SAFE_PATH = /^\/(en|te|hi)\/doctor(\/[A-Za-z0-9_-]+)*$/;

/** `next` is kept only if it is a plain internal doctor path (no query, no fragment, no PHI). */
export function loginRedirect(locale: DoctorLocale, currentPath: string): string {
  const next = SAFE_PATH.test(currentPath) ? currentPath : doctorPaths(locale).dashboard;
  return `/${locale}/login?next=${encodeURIComponent(next)}`;
}

export function decideDoctorAccess(guard: GuardResult, locale: DoctorLocale, currentPath: string): GuardDecision {
  if (guard.status === "ok") return { action: "render" };
  if (guard.status === "unauthenticated") return { action: "redirect", to: loginRedirect(locale, currentPath) };
  if (guard.status === "forbidden") return { action: "denied", reason: "forbidden" };
  const section = currentPath.split("/")[3] ?? "";
  return RESTRICTED_ALLOWED.has(section) ? { action: "render" } : { action: "denied", reason: "restricted" };
}
