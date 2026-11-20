/** ADVERSARIAL_REVIEW D3: /verify/check redirects with a relative Location, never built from Host. */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/[locale]/verify/check/route";
import { proofCheckLocation } from "@/modules/proof-of-visit";

const CODE = "0123456789abcdef0123456789abcdef";

async function check(locale: string, query: string, host = "evil.example") {
  const req = new NextRequest(`http://${host}/${locale}/verify/check${query}`, { headers: { host } });
  return GET(req, { params: Promise.resolve({ locale }) });
}

describe("proofCheckLocation", () => {
  it("valid codes go to the canonical result path", () => {
    expect(proofCheckLocation("te", "0123 4567 89AB cdef-0123.4567_89ab cdef")).toBe(`/te/verify/${CODE}`);
  });
  it("empty and invalid entries go back to the entry page with an error", () => {
    expect(proofCheckLocation("en", "  ")).toBe("/en/verify?error=required");
    expect(proofCheckLocation("hi", "abc")).toBe("/hi/verify?error=invalid&code=abc");
  });
  it("caps the echoed entry at 80 characters and encodes it", () => {
    const loc = proofCheckLocation("en", `${"x".repeat(100)}&next=//evil`);
    const q = new URLSearchParams(loc.split("?")[1]);
    expect(q.get("code")).toHaveLength(80);
    expect(q.get("next")).toBeNull();
  });
  it("unknown locales fall back to en and every result is a same-origin path", () => {
    for (const [l, typed] of [["//evil.example", CODE], ["fr", ""], ["en", "//evil.example/x"], ["en", "https://evil.example"]] as const) {
      const loc = proofCheckLocation(l, typed);
      expect(loc).toMatch(/^\/(en|te|hi)\/verify(\/|\?)/);
      expect(loc.startsWith("//")).toBe(false);
    }
  });
});

describe("GET /[locale]/verify/check", () => {
  it("answers 303 with a relative Location that ignores the Host header", async () => {
    const res = await check("en", `?code=${CODE}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/en/verify/${CODE}`);
    expect(res.headers.get("location")).not.toMatch(/evil/);
  });
  it("keeps no-referrer and no-store, and has no body", async () => {
    const res = await check("hi", "?code=abc");
    expect(res.headers.get("location")).toBe("/hi/verify?error=invalid&code=abc");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });
});
