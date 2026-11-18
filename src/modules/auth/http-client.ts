import type { z } from "zod";
import { codeFromStatus, fail, ok, type ApiError, type ApiResult } from "@/lib/api/result";

/**
 * Minimal JSON transport shared by the identity module HTTP adapters.
 * - No-store, same-origin, bearer token only when supplied by the (server-side) caller.
 * - Every response body is validated; an unexpected shape is `unavailable`, never trusted.
 * - Raw server text is never surfaced; only the stable server `error.code` is exposed
 *   to adapters (via `serverCode`) so they can map it to an ApiErrorCode.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type HttpAdapterOptions = {
  /** Absolute origin for server-side calls; empty string for same-origin browser calls. */
  baseUrl?: string;
  fetch?: FetchLike;
  /**
   * Supplies the user's access token. Server-side wiring (cookie -> bearer) belongs to
   * src/lib/auth; returning null means "no session".
   */
  getAccessToken?: () => Promise<string | null> | string | null;
};

export type TransportFailure = { ok: false; error: ApiError; serverCode: string | null; status: number };
export type TransportResult<T> = { ok: true; data: T; status: number } | TransportFailure;

type RequestOptions<T> = {
  method: "GET" | "POST" | "PATCH";
  path: `/api/${string}`;
  body?: unknown;
  schema: z.ZodType<T>;
  /** Default true. Set false for unauthenticated endpoints (signup/login). */
  auth?: boolean;
};

const serverErrorCode = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null) return null;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? code : null;
};

/** Retry-After as delay-seconds or HTTP-date (RFC 9110), converted to non-negative seconds. */
export function parseRetryAfter(raw: string | null, now: Date = new Date()): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

export function createJsonClient(options: HttpAdapterOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(req: RequestOptions<T>): Promise<TransportResult<T>> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.auth !== false) {
      let token: string | null = null;
      try {
        token = options.getAccessToken ? await options.getAccessToken() : null;
      } catch {
        // Session store failure is an outage, not "signed out".
        return { ok: false, error: { code: "unavailable" }, serverCode: null, status: 0 };
      }
      if (!token) return { ok: false, error: { code: "unauthenticated" }, serverCode: null, status: 401 };
      headers.Authorization = `Bearer ${token}`;
    }
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${req.path}`, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      });
    } catch {
      return { ok: false, error: { code: "unavailable" }, serverCode: null, status: 0 };
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      const code = codeFromStatus(response.status);
      const error: ApiError = { code };
      const seconds = code === "rate_limited" ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
      if (seconds !== undefined) error.retryAfterSeconds = seconds;
      return { ok: false, error, serverCode: serverErrorCode(json), status: response.status };
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) return { ok: false, error: { code: "unavailable" }, serverCode: "invalid_response", status: response.status };
    return { ok: true, data: parsed.data, status: response.status };
  }

  return { request };
}

export type JsonClient = ReturnType<typeof createJsonClient>;

/** Drop transport internals before handing a result to the UI. */
export function toApiResult<T>(result: TransportResult<T>): ApiResult<T> {
  return result.ok ? ok(result.data) : { ok: false, error: result.error };
}

/** Map Zod issues to `field path -> stable code` for 422-style client validation failures. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in fields)) fields[key] = issue.message && /^[a-z_]{1,64}$/.test(issue.message) ? issue.message : issue.code;
  }
  return fields;
}

/** Validate input before any network call; returns a validation failure the UI can map. */
export function validateInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; result: ApiResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, result: fail("validation", { fields: zodFields(parsed.error) }) };
}
