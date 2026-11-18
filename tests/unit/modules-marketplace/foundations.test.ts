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
    expect(formatDateTime("2026-11-18T00:00:00Z", locale)).toMatch(/5:30|05:30/);
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
