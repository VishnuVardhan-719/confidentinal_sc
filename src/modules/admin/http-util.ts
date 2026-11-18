import type { z } from "zod";
import { codeFromStatus, fail, ok, type ApiResult } from "@/lib/api/result";

/**
 * Tiny private fetch wrapper for the operations modules.
 * TODO(REQUESTS.md): replace with the shared API client once src/lib/api owns one.
 *
 * - Never surfaces server text; maps HTTP status to a stable ApiErrorCode.
 * - Validates every response body with a Zod schema (strip semantics), so an
 *   unexpected upstream field can never widen what the UI receives.
 * - Sends credentials same-origin only and asks for no-store responses.
 */
export type HttpOptions = {
  /** Absolute origin for server-side calls; empty string means same-origin relative paths. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Extra headers (for example, forwarded auth on the server). Never log these. */
  headers?: () => Record<string, string>;
};

export type HttpRequest<T> = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  schema: z.ZodType<T>;
};

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export function createHttpClient(options: HttpOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function request<T>(req: HttpRequest<T>): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers?.() ?? {}) };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.idempotencyKey !== undefined) headers["Idempotency-Key"] = req.idempotencyKey;

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${req.path}`, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      return fail("unavailable");
    }

    if (!response.ok) {
      const code = codeFromStatus(response.status);
      const seconds = code === "rate_limited" ? retryAfter(response) : undefined;
      return fail(code, seconds === undefined ? {} : { retryAfterSeconds: seconds });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return fail("unavailable");
    }
    const parsed = req.schema.safeParse(json);
    return parsed.success ? ok(parsed.data) : fail("unavailable");
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

/** Path segment guard: IDs from the UI are always encoded, never interpolated raw. */
export const seg = (value: string): string => encodeURIComponent(value);

/**
 * Converts a server decimal-string paise value (C01 returns `amount_paise::text`)
 * into a safe integer. Returns null when it is not a safe non-negative integer.
 */
export function paiseFromServer(value: string | number): number | null {
  const n = typeof value === "number" ? value : /^(0|[1-9][0-9]{0,15})$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
