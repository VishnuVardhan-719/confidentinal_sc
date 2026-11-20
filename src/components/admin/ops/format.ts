import { LOCALE_TAGS, type AppLocale } from "@/i18n/routing";
import { formatPaise } from "@/lib/money";

/**
 * Display formatting for operations screens. Money arrives as integer paise and
 * times as UTC ISO strings from the server; both are only formatted here, never
 * recomputed. Times render in Asia/Kolkata.
 */
const TIME_ZONE = "Asia/Kolkata";
const DASH = "—";

/**
 * Money for operations screens: the canonical formatter (src/lib/money) with this module's dash
 * for a missing or invalid amount. Amounts are never formatted or converted anywhere else.
 */
export function formatPaiseOrDash(paise: unknown): string {
  return formatPaise(paise) ?? DASH;
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
