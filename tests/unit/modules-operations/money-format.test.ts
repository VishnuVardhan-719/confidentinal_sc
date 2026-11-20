import { describe, expect, it } from "vitest";
import { formatPaiseOrDash } from "@/components/admin/ops/format";
import { paiseToDecimalString } from "@/lib/money";
import { rupeesToPaise } from "@/modules/lab/rules";
import { paiseToRupeesInput } from "@/modules/onboarding/form-models";

const DASH = "\u2014"; // em dash, the operations screens' placeholder for a missing or invalid amount

describe("operations money display (wraps src/lib/money)", () => {
  it("formats like the canonical formatter", () => {
    expect(formatPaiseOrDash(60_000)).toBe("₹600.00");
    expect(formatPaiseOrDash(1_234_567_89)).toBe("₹12,34,567.89");
    expect(formatPaiseOrDash(0)).toBe("₹0.00");
  });

  it("shows the dash instead of a negative or malformed amount", () => {
    for (const bad of [-250, 10.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, null, undefined]) {
      expect(formatPaiseOrDash(bad)).toBe(DASH);
    }
  });
});

describe("form prefills round-trip through the parsers", () => {
  it("lab catalogue editor", () => {
    for (const p of [1, 99, 100, 60_005, 99_999_999]) expect(rupeesToPaise(paiseToDecimalString(p) ?? "")).toBe(p);
    // An invalid amount prefills nothing, which the parser rejects, so a guess is never saved.
    expect(paiseToDecimalString(10.5)).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
  });

  it("onboarding fee inputs drop .00 but keep paise", () => {
    expect(paiseToRupeesInput(80_000)).toBe("800");
    expect(paiseToRupeesInput(80_050)).toBe("800.50");
    expect(paiseToRupeesInput(5)).toBe("0.05");
    expect(paiseToRupeesInput(-1)).toBe("");
    expect(paiseToRupeesInput(1.5)).toBe("");
  });
});
