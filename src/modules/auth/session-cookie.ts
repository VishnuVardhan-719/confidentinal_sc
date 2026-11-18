import type { SessionTokens } from "./types";

/**
 * Session cookie policy. Tokens live ONLY in httpOnly cookies set by server actions /
 * route handlers; client JS never sees them. Pure helpers over a minimal cookie-store
 * shape so they are unit-testable and work with `await cookies()` from next/headers.
 */

export const ACCESS_COOKIE = "scv_at";
export const REFRESH_COOKIE = "scv_rt";

const DEFAULT_ACCESS_SECONDS = 60 * 60;
const REFRESH_SECONDS = 7 * 24 * 60 * 60;
/** Upper bound for anything we write; cookies are capped at ~4 KB. */
const MAX_TOKEN_LENGTH = 4000;

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  priority: "high";
};

export type CookieReader = { get(name: string): { value: string } | undefined };
export type CookieWriter = CookieReader & {
  set(name: string, value: string, options: SessionCookieOptions): unknown;
  delete(name: string): unknown;
};

const isSecureEnv = (env: Record<string, string | undefined>) =>
  env.NODE_ENV === "production" || env.APP_ENV === "production";

export function sessionCookieOptions(
  maxAge: number,
  env: Record<string, string | undefined> = process.env,
): SessionCookieOptions {
  return { httpOnly: true, secure: isSecureEnv(env), sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor(maxAge)), priority: "high" };
}

/** Seconds until the server-supplied expiry (unix seconds), bounded to [0, 1 day]. */
export function accessMaxAge(expiresAt: number | null, now: Date = new Date()): number {
  if (expiresAt === null) return DEFAULT_ACCESS_SECONDS;
  const seconds = Math.floor(expiresAt - now.getTime() / 1000);
  return Math.min(Math.max(seconds, 0), 24 * 60 * 60);
}

const usable = (value: string | undefined): string | null =>
  value && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && !/\s/.test(value) ? value : null;

export const readAccessToken = (store: CookieReader): string | null => usable(store.get(ACCESS_COOKIE)?.value);
export const readRefreshToken = (store: CookieReader): string | null => usable(store.get(REFRESH_COOKIE)?.value);

/** True when the browser still holds evidence of a previous session (used to show "session expired"). */
export const hadSession = (store: CookieReader): boolean => readRefreshToken(store) !== null || readAccessToken(store) !== null;

export function writeSession(
  store: CookieWriter,
  tokens: SessionTokens,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): boolean {
  const access = usable(tokens.accessToken);
  const refresh = usable(tokens.refreshToken);
  if (!access || !refresh) return false;
  store.set(ACCESS_COOKIE, access, sessionCookieOptions(accessMaxAge(tokens.expiresAt, now), env));
  store.set(REFRESH_COOKIE, refresh, sessionCookieOptions(REFRESH_SECONDS, env));
  return true;
}

export function clearSession(store: CookieWriter): void {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
