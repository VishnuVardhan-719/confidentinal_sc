import { LOCALE_TAGS, isAppLocale } from "@/i18n/routing";

/** Integer, non-negative, safe paise amount. Anything else is not displayable money. */
export function isValidPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Format integer paise as INR for the given locale (₹1,234.50 / Indian digit grouping).
 * Returns null for invalid input so callers show "amount unavailable" instead of a wrong number.
 * Digits stay Latin in every locale: amounts must match receipts and provider records.
 */
export function formatPaise(paise: unknown, locale: string): string | null {
  if (!isValidPaise(paise)) return null;
  const tag = isAppLocale(locale) ? LOCALE_TAGS[locale] : "en-IN";
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "INR",
    numberingSystem: "latn",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Internal path or https URL with no credentials. Used before rendering any document link. */
export function isSafeDocumentHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length === 0 || href.length > 2000) return false;
  if (/[\s<>"'`\\]/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
