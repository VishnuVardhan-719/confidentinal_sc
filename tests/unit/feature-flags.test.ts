import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, isEnabled } from "@/lib/feature-flags";

describe("feature flags", () => {
  it("are all OFF by default", () => {
    for (const f of FEATURE_FLAGS) expect(isEnabled(f, {})).toBe(false);
  });
  it("only the exact string 'true' enables a flag", () => {
    expect(isEnabled("clinical", { FEATURE_CLINICAL: "true" })).toBe(true);
    expect(isEnabled("clinical", { FEATURE_CLINICAL: "1" })).toBe(false);
    expect(isEnabled("livePayments", { FEATURE_CLINICAL: "true" })).toBe(false);
  });
});
