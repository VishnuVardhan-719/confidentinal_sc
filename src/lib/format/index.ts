import { z } from "zod";
import { formatPaise as formatCanonicalPaise } from "@/lib/money";

export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
const localeTags: Record<Locale, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };
export const TIME_ZONE = "Asia/Kolkata";

export function formatPaise(paise: number, locale: Locale = "en"): string {
  // Canonical formatter (en-IN grouping, Latin digits, 2 decimals; identical in en/te/hi).
  const text = formatCanonicalPaise(paise);
  if (text === null) throw new RangeError(`Expected nonnegative integer paise (${locale})`);
  return text;
}
export function formatDateTime(utc: string, locale: Locale = "en"): string {
  if (!z.iso.datetime().safeParse(utc).success) throw new RangeError("Expected UTC ISO timestamp");
  return new Intl.DateTimeFormat(localeTags[locale], { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(utc));
}
export function formatNumber(value: number, locale: Locale = "en"): string {
  if (!Number.isFinite(value)) throw new RangeError("Expected finite number");
  return new Intl.NumberFormat(localeTags[locale]).format(value);
}
