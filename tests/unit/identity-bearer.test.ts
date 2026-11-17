import { describe, expect, it } from "vitest";
import { bearerToken } from "@/lib/db/request-client";

describe("explicit bearer transport", () => {
  it("accepts one bearer token", () => {
    expect(bearerToken(new Request("http://localhost", { headers: { Authorization: "bEaReR synthetic-token" } }))).toBe("synthetic-token");
  });
  it.each([undefined, "Basic synthetic", "Bearer", "Bearer a b", "Bearer a, Bearer b"])("denies missing or ambiguous authorization: %s", (authorization) => {
    expect(() => bearerToken(new Request("http://localhost", { headers: authorization ? { Authorization: authorization } : { Cookie: "synthetic-session=ignored" } }))).toThrow("unauthenticated");
  });
});
