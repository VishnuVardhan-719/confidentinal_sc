import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/lib/api/http";

const ok = () => new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "content-type": "application/json" } });

async function sent(getAccessToken?: () => string | null | Promise<string | null>) {
  const f = vi.fn(async () => ok());
  const http = createHttpClient({ fetch: f as unknown as typeof fetch, baseUrl: "https://api.test", ...(getAccessToken ? { getAccessToken } : {}) });
  await http.request("/api/x", z.object({}).passthrough());
  return new Headers((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
}

describe("http client bearer", () => {
  it("sends Authorization when a valid token exists", async () => {
    expect((await sent(async () => "abc.def-ghi_123")).get("Authorization")).toBe("Bearer abc.def-ghi_123");
  });
  it("sends nothing without a token", async () => {
    expect((await sent()).get("Authorization")).toBeNull();
    expect((await sent(() => null)).get("Authorization")).toBeNull();
  });
  it("never sends a malformed token (header injection)", async () => {
    expect((await sent(() => "bad token\r\nX: y")).get("Authorization")).toBeNull();
  });
});
