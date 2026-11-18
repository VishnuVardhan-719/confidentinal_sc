/** Stable error codes the UI maps to localized messages. Never render server text directly. */
export const API_ERROR_CODES = [
  "unauthenticated", // 401
  "forbidden", // 403 / privacy-safe 404
  "not_found",
  "conflict", // 409 stale version or slot
  "validation", // 422
  "rate_limited", // 429
  "unavailable", // 5xx / network / timeout
  "gated", // feature or policy gate is off
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiError = {
  code: ApiErrorCode;
  /** field path -> stable validation code, for 422 */
  fields?: Record<string, string>;
  /** server-provided retry hint in seconds, for 429 */
  retryAfterSeconds?: number;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const fail = (code: ApiErrorCode, extra: Omit<ApiError, "code"> = {}): ApiResult<never> => ({
  ok: false,
  error: { code, ...extra },
});

export function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  return "unavailable";
}
