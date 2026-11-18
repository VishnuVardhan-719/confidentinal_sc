import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "@/lib/api/http";
import { createIdempotencyIntent } from "@/lib/api/idempotency";
import { formatPaise, formatDateTime } from "@/lib/format";
import { filtersFromSearchParams, filtersToSearchParams } from "@/modules/providers/filters";

describe("marketplace boundaries", () => {
  it.each([401, 403, 404, 409, 422, 429, 500])("maps HTTP %i without exposing response text", async status => {
    const http = createHttpClient({ fetch: vi.fn(async () => new Response("private medical text", { status })) });
    const codes = { 401: "unauthenticated", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "validation", 429: "rate_limited", 500: "unavailable" };
    expect(await http.request("/api/catalog", z.object({ id: z.string() }))).toEqual({ ok: false, error: { code: codes[status as keyof typeof codes] } });
  });
  it("preserves bounded delta-seconds and HTTP-date retry hints", async () => {
    const now = Date.UTC(2026, 10, 18, 0, 0, 0);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      for (const [retry, seconds] of [["60", 60], [new Date(now + 60_000).toUTCString(), 60], [new Date(now - 60_000).toUTCString(), 0], ["999999999999999999", 99_999_999]] as const) {
        const http = createHttpClient({ fetch: async () => new Response(null, { status: 429, headers: { "Retry-After": retry } }) });
        expect(await http.request("/api/catalog", z.unknown())).toEqual({ ok: false, error: { code: "rate_limited", retryAfterSeconds: seconds } });
      }
      for (const retry of ["invalid", "-1", "1.5"]) {
        const http = createHttpClient({ fetch: async () => new Response(null, { status: 429, headers: { "Retry-After": retry } }) });
        expect(await http.request("/api/catalog", z.unknown())).toEqual({ ok: false, error: { code: "rate_limited" } });
      }
    } finally { clock.mockRestore(); }
  });
  it("cancels unread HTTP error bodies without waiting for an open stream", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream({ cancel });
    const http = createHttpClient({ fetch: async () => new Response(body, { status: 503 }) });
    expect(await http.request("/api/catalog", z.unknown())).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("keeps the safe HTTP error if body cancellation rejects", async () => {
    const cancel = vi.fn(async () => { throw new Error("private cancellation detail"); });
    const http = createHttpClient({ fetch: async () => new Response(new ReadableStream({ cancel }), { status: 403 }) });
    expect(await http.request("/api/catalog", z.unknown())).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("validates and strips responses and uses private same-origin requests", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "safe", secret: "strip" }));
    const http = createHttpClient({ fetch });
    expect(await http.request("/api/catalog", z.object({ id: z.string() }))).toEqual({ ok: true, data: { id: "safe" } });
    expect(fetch.mock.calls[0]).toEqual(["/api/catalog", expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error" })]);
    expect(await http.request("https://outside.invalid/api", z.unknown())).toEqual({ ok: false, error: { code: "validation" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed JSON and schema mismatch", async () => {
    for (const response of [new Response("invalid"), Response.json({ id: 12 })]) {
      const http = createHttpClient({ fetch: async () => response });
      expect(await http.request("/api/catalog", z.object({ id: z.string() }))).toEqual({ ok: false, error: { code: "unavailable" } });
    }
  });
  it("aborts timeouts and maps network failures", async () => {
    const http = createHttpClient({ timeoutMs: 5, fetch: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("private transport message")));
    }) });
    expect(await http.request("/api/catalog", z.unknown())).toEqual({ ok: false, error: { code: "unavailable" } });
  });
  it("keeps one intent key across retries and isolates new intents", () => {
    const first = createIdempotencyIntent();
    expect(first.key).toBe(first.key);
    expect(z.uuid().safeParse(first.key).success).toBe(true);
    expect(createIdempotencyIntent().key).not.toBe(first.key);
  });
  it.each(["en", "te", "hi"] as const)("formats integer paise and IST for %s", locale => {
    expect(formatPaise(12345, locale)).toContain("123.45");
    expect(formatDateTime("2026-11-18T00:00:00Z", locale)).toMatch(/(?:^|[^0-9])(?:05:30|5:30\s*am)$/i);
  });
  it("preserves the paise remainder throughout the safe-integer range", () => {
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(1)).toBe("₹0.01");
    expect(formatPaise(100)).toBe("₹1.00");
    expect(formatPaise(Number.MAX_SAFE_INTEGER)).toContain(".91");
    expect(() => formatDateTime("2026-02-30T00:00:00Z")).toThrow();
  });
  it("rejects fractional/unsafe money", () => {
    for (const value of [1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => formatPaise(value)).toThrow();
  });
  it("roundtrips validated public filters and rejects duplicate keys", () => {
    const value = { category: "doctor" as const, pin: "500001", priceMax: 12345, sort: "price_asc" as const, limit: 20 };
    expect(filtersFromSearchParams(filtersToSearchParams(value))).toEqual({ ok: true, data: value });
    for (const query of ["pin=abc&category=doctor", "pin=500001&category=doctor&pin=500002", "pin=500001&category=unknown"]) {
      expect(filtersFromSearchParams(new URLSearchParams(query)).ok).toBe(false);
    }
  });
});
