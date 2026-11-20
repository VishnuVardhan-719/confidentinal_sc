import { describe, expect, it } from "vitest";
import { formatPaise, formatSignedPaise, isValidPaise, paiseToDecimalString } from "@/lib/money";

/** Canonical paise formatter (src/lib/money). One table per function; every row is one decision. */

const NOT_MONEY: [string, unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["a numeric string", "80000"],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["a fraction of a paisa", 10.5],
  ["2^53 (not a safe integer)", 2 ** 53],
  ["a bigint", BigInt(800)],
  ["an object", { amountPaise: 800 }],
];

describe("formatPaise", () => {
  it.each([
    ["zero", 0, "₹0.00"],
    ["negative zero", -0, "₹0.00"],
    ["one paisa", 1, "₹0.01"],
    ["99 paise", 99, "₹0.99"],
    ["one rupee", 100, "₹1.00"],
    ["whole rupees keep two decimals", 80_000, "₹800.00"],
    ["rupees and paise", 80_050, "₹800.50"],
    ["thousands", 1_234_50, "₹1,234.50"],
    ["lakh grouping", 1_234_567_89, "₹12,34,567.89"],
    ["crore grouping", 10_000_000_000, "₹10,00,00,000.00"],
    ["largest safe integer, exact", Number.MAX_SAFE_INTEGER, "₹9,00,71,99,25,47,409.91"],
  ])("%s: %s paise -> %s", (_case, paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });

  it.each([...NOT_MONEY, ["a negative amount", -250]])("%s -> null", (_case, value) => {
    expect(formatPaise(value)).toBeNull();
  });

  it("uses Latin digits and no float rounding (0.1 + 0.2 style errors cannot appear)", () => {
    expect(formatPaise(30)).toBe("₹0.30");
    expect(formatPaise(1_005)).toBe("₹10.05");
    expect(formatPaise(4_503_599_627_370_497)).toBe("₹4,50,35,99,62,73,704.97");
    expect(formatPaise(123_456)).toMatch(/^₹[0-9,]+\.[0-9]{2}$/);
  });
});

describe("formatSignedPaise", () => {
  it.each([
    ["negative", -25_050, "-₹250.50"],
    ["negative one paisa", -1, "-₹0.01"],
    ["zero", 0, "₹0.00"],
    ["positive", 25_050, "₹250.50"],
    ["most negative safe integer", Number.MIN_SAFE_INTEGER, "-₹9,00,71,99,25,47,409.91"],
  ])("%s: %s -> %s", (_case, paise, expected) => {
    expect(formatSignedPaise(paise)).toBe(expected);
  });

  it.each(NOT_MONEY)("%s -> null", (_case, value) => {
    expect(formatSignedPaise(value)).toBeNull();
  });
});

describe("paiseToDecimalString", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [100, "1.00"],
    [80_050, "800.50"],
    [1_234_567_891, "12345678.91"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"],
  ])("%s -> %s", (paise, expected) => {
    expect(paiseToDecimalString(paise)).toBe(expected);
  });

  it.each([...NOT_MONEY, ["a negative amount", -250]])("%s -> null", (_case, value) => {
    expect(paiseToDecimalString(value)).toBeNull();
  });
});

describe("isValidPaise", () => {
  it.each([[0, true], [1, true], [Number.MAX_SAFE_INTEGER, true], [-1, false], [1.5, false], [Number.NaN, false], [null, false], ["1", false]])(
    "%s -> %s",
    (value, expected) => {
      expect(isValidPaise(value)).toBe(expected);
    },
  );
});
