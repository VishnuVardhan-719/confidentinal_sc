/** R9-D9: GET /{locale}/find (no-JS finder fallback): relative 303, invalid input goes back flagged. */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/[locale]/(public)/find/route";
import { finderRedirectPath } from "@/components/public/finder";

async function find(locale: string, query: string, host = "evil.example") {
  const req = new NextRequest(`http://${host}/${locale}/find${query}`, { headers: { host } });
  return GET(req, { params: Promise.resolve({ locale }) });
}

describe("finderRedirectPath", () => {
  it("valid PIN + service goes to the directory with ?pin=", () => {
    expect(finderRedirectPath("te", "500001", "labTests")).toBe("/te/lab-tests?pin=500001");
    // Telugu/Devanagari digits and spacing are normalised like the inline finder.
    expect(finderRedirectPath("hi", "५००००१", "doctors")).toBe("/hi/doctors?pin=500001");
  });
  it("missing, malformed or unknown input returns to the finder flagged invalid", () => {
    for (const [pin, service] of [
      [null, null],
      ["", "doctors"],
      ["012345", "doctors"],
      ["50000", "doctors"],
      ["500001", null],
      ["500001", "pharmacy"],
      ["500001", "__proto__"],
      ["<script>", "doctors"],
    ] as const) {
      expect(finderRedirectPath("en", pin, service), `${pin}/${service}`).toBe("/en?finder=invalid#finder");
    }
  });
  it("unknown locales fall back to en; results are always same-origin paths", () => {
    expect(finderRedirectPath("fr", "500001", "caretakers")).toBe("/en/caretakers?pin=500001");
    expect(finderRedirectPath("//evil.example", null, null)).toBe("/en?finder=invalid#finder");
  });
});

describe("GET /[locale]/find", () => {
  it("answers 303 with a relative Location that ignores the Host header", async () => {
    const res = await find("en", "?pin=500001&service=ambulances");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/en/ambulances?pin=500001");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("sends invalid input back to the finder and echoes nothing", async () => {
    const res = await find("te", "?pin=12&service=x%22%3E%3Cimg");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/te?finder=invalid#finder");
  });
});
