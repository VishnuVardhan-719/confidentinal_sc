import { LOCALE_TAGS, type AppLocale } from "@/i18n/routing";

/**
 * Display formatting for operations screens. Money arrives as integer paise and
 * times as UTC ISO strings from the server; both are only formatted here, never
 * recomputed. Times render in Asia/Kolkata.
 */
const TIME_ZONE = "Asia/Kolkata";
const DASH = "—";

/**
 * Integer paise -> exact "rupees.paise" decimal string (no floating-point division).
 * Negative amounts keep their sign. Used for display and for prefilled form inputs.
 * Anything that is not a safe integer (10.5, NaN, Infinity, 2^53) returns DASH instead of a
 * malformed amount; a prefilled price input then fails validation rather than saving a guess.
 */
export function paiseToRupeesString(paise: number): string {
  if (!Number.isSafeInteger(paise)) return DASH;
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rest = abs % 100;
  return `${sign}${(abs - rest) / 100}.${String(rest).padStart(2, "0")}`;
}

export function formatPaise(paise: number, locale: AppLocale): string {
  if (!Number.isSafeInteger(paise)) return DASH;
  // Intl formats the decimal string exactly (rupees and paise kept as integers until here).
  return new Intl.NumberFormat(LOCALE_TAGS[locale], { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(
    paiseToRupeesString(paise) as `${number}`,
  );
}

function valid(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function formatDateTime(iso: string | null | undefined, locale: AppLocale): string {
  const d = valid(iso);
  return d ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(d) : DASH;
}

export function formatDate(iso: string | null | undefined, locale: AppLocale): string {
  const d = valid(iso);
  return d ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeZone: TIME_ZONE }).format(d) : DASH;
}

/** "20 Nov 2026, 8:00 am – 9:00 am" style window; falls back to two full timestamps across days. */
export function formatWindow(start: string, end: string, locale: AppLocale): string {
  const s = valid(start);
  const e = valid(end);
  if (!s || !e) return DASH;
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
  if (day(s) !== day(e)) return `${formatDateTime(start, locale)} – ${formatDateTime(end, locale)}`;
  const time = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { timeStyle: "short", timeZone: TIME_ZONE });
  return `${formatDate(start, locale)}, ${time.format(s)} – ${time.format(e)}`;
}

export function formatNumber(n: number, locale: AppLocale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(n);
}
