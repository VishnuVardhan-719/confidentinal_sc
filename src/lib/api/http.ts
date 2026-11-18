import type { z } from "zod";
import { codeFromStatus, fail, ok, type ApiResult } from "./result";

export type HttpRequest = {
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
export interface HttpClient {
  request<T>(path: string, schema: z.ZodType<T>, options?: HttpRequest): Promise<ApiResult<T>>;
}

function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  const maximum = 99_999_999;
  if (/^[0-9]+$/.test(value)) return Math.min(Number(value), maximum);
  // HTTP dates begin with a weekday; avoid Date.parse coercing invalid numeric hints.
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[ ,]/i.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(maximum, Math.max(0, Math.ceil((date - Date.now()) / 1000))) : undefined;
}

/** Same-origin JSON only. No automatic mutation retries or raw error-body parsing. */
/** Server components cannot fetch relative URLs. A configured origin (never request headers) is required there. */
export function serverApiOrigin(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.APP_ORIGIN;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function createHttpClient(config: { fetch?: typeof fetch; timeoutMs?: number; baseUrl?: string } = {}): HttpClient {
  const fetcher = config.fetch ?? globalThis.fetch;
  const timeout = config.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid request timeout");
  const origin = config.baseUrl === undefined ? "" : serverApiOrigin({ APP_ORIGIN: config.baseUrl });
  if (origin === undefined) throw new Error("Invalid API origin");
  return {
    async request(path, schema, options = {}) {
      if (!/^\/api\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9=&%_,.:-]*)?$/.test(path) || /%0[ad]/i.test(path)) return fail("validation");
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, timeout);
      try {
        const headers = new Headers({ Accept: "application/json" });
        if (options.body !== undefined) headers.set("Content-Type", "application/json");
        if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
        const response = await fetcher(origin + path, {
          method: options.method ?? "GET", headers,
          credentials: "same-origin", redirect: "error", cache: "no-store",
          signal: controller.signal,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (!response.ok) {
          // Release an unconsumed error stream without delaying the safe error response.
          void response.body?.cancel().catch(() => {});
          const seconds = retryAfterSeconds(response.headers.get("Retry-After"));
          return fail(codeFromStatus(response.status), response.status === 429 && seconds !== undefined ? { retryAfterSeconds: seconds } : {});
        }
        const parsed = schema.safeParse(await response.json());
        return parsed.success ? ok(parsed.data) : fail("unavailable");
      } catch {
        return fail("unavailable");
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      }
    },
  };
}
