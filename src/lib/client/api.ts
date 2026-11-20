import { clearTokens, getTokens, refreshTokens } from "./session";

/*
 * Browser client for the app's own route handlers (src/app/api/**). The backend takes an explicit
 * `Authorization: Bearer` header and never reads cookies, so requests send no credentials. Every error
 * body is `{ error: { code } }`; it becomes an ApiError with the HTTP status and that code.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | undefined | null>;

export type ApiOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  query?: Query;
  /** Send the signed-in user's access token. A 401 triggers one token refresh and one retry. */
  auth?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function send(url: string, options: ApiOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  try {
    return await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
      credentials: "omit",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, "network_error");
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorCode(body: unknown): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" && code.length <= 80 ? code : "unknown_error";
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = withQuery(path, options.query);
  let token: string | null = null;
  if (options.auth) {
    const tokens = getTokens();
    if (!tokens) throw new ApiError(401, "unauthenticated");
    token = tokens.accessToken;
    // Refresh shortly before expiry instead of spending a request on a known-stale token.
    if (tokens.expiresAt && tokens.expiresAt * 1000 - Date.now() < 30_000) token = (await refreshTokens()) ?? token;
  }

  let response = await send(url, options, token);
  if (response.status === 401 && options.auth) {
    const fresh = await refreshTokens();
    if (!fresh) {
      clearTokens();
      throw new ApiError(401, "unauthenticated");
    }
    response = await send(url, options, fresh);
    if (response.status === 401) clearTokens();
  }

  const body = await readBody(response);
  if (!response.ok) throw new ApiError(response.status, errorCode(body));
  return body as T;
}

/** Plain-language message for an API failure. Callers may override specific codes for their context. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  if (error.code === "network_error") return "We could not reach SureCure Visit. Check your connection and try again.";
  if (error.code === "invalid_credentials") return "That email and password do not match an account.";
  if (error.code === "inactive_account") return "This account is not active. Contact support if you think this is a mistake.";
  switch (error.status) {
    case 401:
      return "Your session has ended. Please sign in again.";
    case 403:
      return "Your account cannot do this.";
    case 404:
      return "We could not find that. It may have been removed.";
    case 409:
      return "This changed while you were looking at it. Refresh and try again.";
    case 422:
      return "Some details were not accepted. Check them and try again.";
    case 429:
      return "Too many attempts. Wait a minute and try again.";
    default:
      return "The service is not available right now. Please try again in a few minutes.";
  }
}
