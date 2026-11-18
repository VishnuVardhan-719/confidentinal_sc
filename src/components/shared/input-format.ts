/** Pure helpers for phone and OTP inputs. Shared by PhoneInput/OTPInput and unit-tested. */

/** Keep ASCII digits only; also maps Devanagari (०-९) and Telugu (౦-౯) digits typed on native keyboards. */
export function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x30 && code <= 0x39) out += ch;
    else if (code >= 0x966 && code <= 0x96f) out += String(code - 0x966);
    else if (code >= 0xc66 && code <= 0xc6f) out += String(code - 0xc66);
  }
  return out;
}

/**
 * Normalise what a user typed or pasted into a 10-digit Indian mobile number (national part only).
 * Strips spaces, dashes, a leading +91 / 91 / 0 when that leaves 10 digits.
 */
export function normalizeIndianMobile(input: string): string {
  const digits = toAsciiDigits(input);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, 10);
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
