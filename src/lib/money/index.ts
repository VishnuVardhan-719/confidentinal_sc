/**
 * The one place that turns integer paise into rupee text (ADVERSARIAL_REVIEW finding 3).
 *
 * Contract, for every function here:
 * - Input is integer paise from the server. Anything that is not a safe integer (null, undefined,
 *   strings, NaN, Infinity, 10.5, 2^53) is not money and gives `null`, so the caller shows its own
 *   "amount unavailable" text instead of a wrong number.
 * - No floating-point maths: rupees and paise are split with integer operations, and Intl formats an
 *   exact decimal string.
 * - Always two decimals ("₹800.00"), en-IN (lakh/crore) grouping, Latin digits and a "₹" prefix in
 *   every UI locale, so an amount reads the same on screens, receipts and provider records.
 *   te-IN and hi-IN give identical output today; using en-IN pins that.
 * - Negative amounts are refused by `formatPaise`. Use `formatSignedPaise` only where a sign is
 *   meaningful (an adjustment or a difference), never for a price, fee, due or collected amount.
 *
 * tests/unit/money-guard.test.ts fails on new ad-hoc paise formatting outside this file.
 */

const FORMAT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  numberingSystem: "latn",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer, non-negative, safe paise amount. */
export function isValidPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function signedDecimal(paise: number): string {
  const abs = Math.abs(paise);
  const rest = abs % 100;
  // abs - rest is a multiple of 100 within the safe range, so this division is exact.
  const rupees = (abs - rest) / 100;
  return `${paise < 0 ? "-" : ""}${rupees}.${String(rest).padStart(2, "0")}`;
}

/** 80050 -> "800.50", 0 -> "0.00". Exact decimal text for form inputs and Intl. Null if invalid or negative. */
export function paiseToDecimalString(paise: unknown): string | null {
  return isValidPaise(paise) ? signedDecimal(paise) : null;
}

/** 80050 -> "₹800.50", 12345678900 -> "₹12,34,56,789.00". Null if invalid or negative. */
export function formatPaise(paise: unknown): string | null {
  return isValidPaise(paise) ? FORMAT.format(signedDecimal(paise) as `${number}`) : null;
}

/** Like formatPaise but keeps a sign: -25050 -> "-₹250.50". Null if not a safe integer. */
export function formatSignedPaise(paise: unknown): string | null {
  return typeof paise === "number" && Number.isSafeInteger(paise) ? FORMAT.format(signedDecimal(paise) as `${number}`) : null;
}
