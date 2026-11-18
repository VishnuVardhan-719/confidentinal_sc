import { z } from "zod";

export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
const localeTags: Record<Locale, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };
export const TIME_ZONE = "Asia/Kolkata";

export function formatPaise(paise: number, locale: Locale = "en"): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError("Expected nonnegative integer paise");
  const formatter = new Intl.NumberFormat(localeTags[locale], { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fraction = new Intl.NumberFormat(localeTags[locale], { useGrouping: false, minimumIntegerDigits: 2 }).format(paise % 100);
  return formatter.formatToParts(Math.floor(paise / 100)).map(part => part.type === "fraction" ? fraction : part.value).join("");
}
export function formatDateTime(utc: string, locale: Locale = "en"): string {
  if (!z.iso.datetime().safeParse(utc).success) throw new RangeError("Expected UTC ISO timestamp");
  return new Intl.DateTimeFormat(localeTags[locale], { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(utc));
}
export function formatNumber(value: number, locale: Locale = "en"): string {
  if (!Number.isFinite(value)) throw new RangeError("Expected finite number");
  return new Intl.NumberFormat(localeTags[locale]).format(value);
}
