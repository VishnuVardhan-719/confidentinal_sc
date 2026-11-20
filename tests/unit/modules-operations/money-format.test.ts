import { describe, expect, it } from "vitest";
import { formatPaise, paiseToRupeesString } from "@/components/admin/ops/format";
import { rupeesToPaise } from "@/modules/lab/rules";

const DASH = "\u2014"; // em dash, the operations screens' placeholder for a missing value

describe("integer paise money helpers", () => {
  it("splits paise into rupees and paise without floating point", () => {
    expect(paiseToRupeesString(60000)).toBe("600.00");
    expect(paiseToRupeesString(60005)).toBe("600.05");
    expect(paiseToRupeesString(1)).toBe("0.01");
    expect(paiseToRupeesString(0)).toBe("0.00");
    expect(paiseToRupeesString(-250)).toBe("-2.50");
    // 0.1 + 0.2 style float error would show here with paise / 100.
    expect(paiseToRupeesString(1_234_567_891)).toBe("12345678.91");
  });

  it("round-trips through the catalogue editor's parser", () => {
    for (const p of [1, 99, 100, 60005, 99_999_999]) expect(rupeesToPaise(paiseToRupeesString(p))).toBe(p);
  });

  it("refuses anything that is not a safe integer instead of producing a malformed amount", () => {
    // Before the integer check, 10.5 gave "0.10.5".
    for (const bad of [10.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53]) {
      expect(paiseToRupeesString(bad)).toBe(DASH);
      expect(formatPaise(bad, "en")).toBe(DASH);
    }
    // The catalogue editor's parser rejects the dash, so a bad prefill can never be saved.
    expect(rupeesToPaise(DASH)).toBeNull();
    expect(paiseToRupeesString(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });

  it("formats with the en-IN grouping and the rupee sign", () => {
    expect(formatPaise(60000, "en")).toBe("₹600.00");
    expect(formatPaise(1_234_567_89, "en")).toBe("₹12,34,567.89");
    expect(formatPaise(Number.NaN, "en")).toBe("—");
  });
});
