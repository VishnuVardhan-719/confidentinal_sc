import type { z } from "zod";
import { codeFromStatus, fail, ok, type ApiResult } from "@/lib/api/result";

/**
 * Tiny private fetch wrapper for the doctor/clinical/records modules.
 * TEMPORARY: should be replaced by the shared client in src/lib/api once it exists
 * (logged in docs/frontend/REQUESTS.md).
 *
 * - Never logs request or response bodies (they can contain PHI).
 * - Never puts data in the URL beyond the opaque server resource ID.
 * - Never renders server text: only stable ApiErrorCode values leave this function.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpOptions = {
  /**
   * Bearer token for the signed-in user (B01/I01 routes authenticate with
   * `Authorization: Bearer` only; cookies are ignored). Server-side callers read it from the
   * httpOnly session cookie. `null` means no session: the call fails "unauthenticated"
   * without touching the network. A rejected lookup fails "unavailable".
   */
  getAccessToken: () => string | null | Promise<string | null>;
  fetchImpl?: FetchLike;
  /** Absolute origin for server-side calls (see appOrigin); empty string means same-origin relative paths. */
  baseUrl?: string;
  /** Clock for Retry-After HTTP-dates (tests). */
  now?: () => Date;
};

/** HttpOptions that make every call fail "unauthenticated" without a request (no session wired). */
export const NO_SESSION_HTTP: HttpOptions = { getAccessToken: () => null };

/**
 * Server origin for absolute fetches, from APP_ORIGIN only (never from the Host header).
 * https required except for localhost/127.0.0.1 in development. Throws on misconfiguration.
 */
export function appOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.APP_ORIGIN;
  if (!raw) throw new Error("APP_ORIGIN is not set");
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("APP_ORIGIN must be https");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("APP_ORIGIN must be a bare origin");
  return url.origin;
}

type RequestArgs<T> = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  schema: z.ZodType<T>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Encode an opaque server ID as a path segment, refusing anything that is not ID-shaped. */
export function idSegment(id: string): string | null {
  return ID_PATTERN.test(id) ? encodeURIComponent(id) : null;
}

/** Retry-After as delta-seconds or HTTP-date (RFC 9110), converted to non-negative seconds. */
export function parseRetryAfter(raw: string | null, now: Date): number | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (/^\d{1,9}$/.test(v)) return Number(v);
  // IMF-fixdate only ("Sun, 06 Nov 1994 08:49:37 GMT"); Date.parse alone accepts junk like "-5".
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) return undefined;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.ceil((t - now.getTime()) / 1000));
}

export function createHttp(options: HttpOptions) {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? "";
  const now = options.now ?? (() => new Date());

  return async function request<T>(args: RequestArgs<T>): Promise<ApiResult<T>> {
    let token: string | null;
    try {
      token = await options.getAccessToken();
    } catch {
      return fail("unavailable");
    }
    // Header-safe token only; anything else is treated as no session.
    if (!token || !/^[A-Za-z0-9._~+/=-]+$/.test(token)) return fail("unauthenticated");

    const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (args.body !== undefined) headers["Content-Type"] = "application/json";
    if (args.idempotencyKey) headers["Idempotency-Key"] = args.idempotencyKey;

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${args.path}`, {
        method: args.method,
        headers,
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
        credentials: "same-origin",
        cache: "no-store",
        // Never follow redirects with a bearer token attached.
        redirect: "error",
        signal: args.signal,
      });
    } catch {
      return fail("unavailable");
    }

    if (!res.ok) {
      const code = codeFromStatus(res.status);
      const seconds = code === "rate_limited" ? parseRetryAfter(res.headers.get("Retry-After"), now()) : undefined;
      return fail(code, seconds === undefined ? {} : { retryAfterSeconds: seconds });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return fail("unavailable");
    }
    const parsed = args.schema.safeParse(json);
    // A response that does not match the agreed DTO is treated as unavailable, never guessed at.
    return parsed.success ? ok(parsed.data) : fail("unavailable");
  };
}

export type HttpRequest = ReturnType<typeof createHttp>;
