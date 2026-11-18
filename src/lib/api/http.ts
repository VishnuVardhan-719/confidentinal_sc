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

/** Same-origin JSON only. No automatic mutation retries or raw error-body parsing. */
export function createHttpClient(config: { fetch?: typeof fetch; timeoutMs?: number } = {}): HttpClient {
  const fetcher = config.fetch ?? globalThis.fetch;
  const timeout = config.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid request timeout");
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
        const response = await fetcher(path, {
          method: options.method ?? "GET", headers,
          credentials: "same-origin", redirect: "error", cache: "no-store",
          signal: controller.signal,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (!response.ok) {
          const retry = response.headers.get("Retry-After");
          const seconds = retry !== null && /^\d{1,8}$/.test(retry) ? Number(retry) : undefined;
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
