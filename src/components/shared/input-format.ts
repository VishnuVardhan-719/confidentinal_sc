/** Pure helpers for phone and OTP inputs. Shared by PhoneInput/OTPInput and unit-tested. */

/** Zero code point of each decimal digit block we accept from keyboards, IMEs and SMS apps. */
const DIGIT_ZEROS = [
  0x30, // ASCII
  0x660, // Arabic-Indic
  0x6f0, // Extended Arabic-Indic
  0x966, // Devanagari
  0xc66, // Telugu
  0xff10, // Full-width
];

/** Keep decimal digits only, mapped to ASCII. Everything else (spaces, dashes, letters) is dropped. */
export function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    if (zero !== undefined) out += String(code - zero);
  }
  return out;
}

/** Longest digit string we keep while typing (E.164 maximum). Longer input is still invalid. */
const MAX_PHONE_DIGITS = 15;

/**
 * Normalise what a user typed or pasted into the national part of an Indian mobile number.
 * Strips spaces, dashes and a leading +91 / 91 / 0 only when exactly 10 digits remain. Anything else
 * is kept as typed (never silently truncated), so a wrong or foreign number fails validation
 * instead of becoming a different valid-looking number.
 */
export function normalizeIndianMobile(input: string): string {
  const digits = toAsciiDigits(input).slice(0, MAX_PHONE_DIGITS);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Shape check only. The server is the authority on whether a number can receive an OTP. */
export function isValidIndianMobile(national: string): boolean {
  return /^[6-9]\d{9}$/.test(national);
}

/** "9876543210" -> "98765 43210" for display. Never used for storage. */
export function formatIndianMobile(national: string): string {
  const d = toAsciiDigits(national).slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** Sanitize typed/pasted OTP text to at most `length` ASCII digits. */
export function sanitizeOtp(input: string, length = 6): string {
  return toAsciiDigits(input).slice(0, length);
}

export function isCompleteOtp(value: string, length = 6): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value);
}
