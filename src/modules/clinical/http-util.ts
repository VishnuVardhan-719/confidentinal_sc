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
  fetchImpl?: FetchLike;
  /** Absolute origin for server-side calls; empty string means same-origin relative paths. */
  baseUrl?: string;
};

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

function retryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function createHttp(options: HttpOptions = {}) {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? "";

  return async function request<T>(args: RequestArgs<T>): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: "application/json" };
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
        signal: args.signal,
      });
    } catch {
      return fail("unavailable");
    }

    if (!res.ok) {
      const code = codeFromStatus(res.status);
      const seconds = code === "rate_limited" ? retryAfter(res) : undefined;
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
