import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

const ok = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

describe("env", () => {
  it("accepts valid public env", () => {
    expect(parsePublicEnv(ok).NEXT_PUBLIC_SUPABASE_URL).toBe(ok.NEXT_PUBLIC_SUPABASE_URL);
  });
  it("rejects missing or malformed values", () => {
    expect(() => parsePublicEnv({})).toThrow();
    expect(() => parsePublicEnv({ ...ok, NEXT_PUBLIC_SUPABASE_URL: "nope" })).toThrow();
  });
  it("service role key is optional on the server", () => {
    expect(parseServerEnv(ok).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
