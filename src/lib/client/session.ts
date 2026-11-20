import { z } from "zod";

/*
 * Browser-side session tokens from POST /api/auth/login.
 *
 * Kept in memory and mirrored to sessionStorage, so a session survives a reload but ends with the tab and is
 * never sent automatically (no cookie, so no CSRF surface). The trade-off is that a script injected into the
 * page could read the tokens; the CSP and React escaping are the defence there. See docs/SESSION_LOG.md.
 */

const STORAGE_KEY = "scv.session.v1";

const tokensSchema = z.object({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(8192),
  expiresAt: z.number().int().positive().optional(),
});

export type Tokens = z.infer<typeof tokensSchema>;

/** undefined = not read from storage yet (server render, or before hydration). */
let tokens: Tokens | null | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function load(): Tokens | null {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = tokensSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  if (tokens === undefined) tokens = load();
  return tokens;
}

export function setTokens(next: Tokens | null) {
  tokens = next;
  const store = storage();
  if (store) {
    if (next) store.setItem(STORAGE_KEY, JSON.stringify(next));
    else store.removeItem(STORAGE_KEY);
  }
  for (const listener of listeners) listener();
}

export function clearTokens() {
  if (getTokens() !== null) setTokens(null);
}

export function subscribeTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const tokenResponse = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive().optional(),
});

/** Validates a login/refresh response body into tokens, or null if it is not one. */
export function parseTokenResponse(body: unknown): Tokens | null {
  const parsed = tokenResponse.safeParse(body);
  return parsed.success ? parsed.data : null;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Exchanges the refresh token for new tokens. One request at a time: concurrent callers share it.
 * Returns the new access token, or null if there is no session or it was rejected (tokens are then cleared).
 * A network or server failure returns null but keeps the tokens, so a later retry can still succeed.
 */
export function refreshTokens(): Promise<string | null> {
  const current = getTokens();
  if (!current) return Promise.resolve(null);
  refreshing ??= (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
        cache: "no-store",
        credentials: "omit",
      });
      if (response.ok) {
        const next = parseTokenResponse(await response.json().catch(() => null));
        if (next) {
          setTokens(next);
          return next.accessToken;
        }
      }
      if ([401, 403, 422].includes(response.status)) clearTokens();
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
