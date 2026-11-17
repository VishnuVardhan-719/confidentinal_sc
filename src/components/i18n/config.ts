import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import te from "@/messages/te.json";

export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Readable by the inline lang script, so not httpOnly. Holds only "en" | "te" | "hi". */
export const LOCALE_COOKIE = "scv-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language is named in its own script, so a reader can find theirs without reading English. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", te: "తెలుగు", hi: "हिन्दी" };

export type Messages = typeof en;

// Typed as Messages so a missing or misspelled key in te/hi fails typecheck.
const dictionaries: Record<Locale, Messages> = { en, te, hi };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/** Splits a message around a {token} so a link or number can sit at the right place in any word order. */
export function splitAt(message: string, token: string): [string, string] {
  const marker = `{${token}}`;
  const i = message.indexOf(marker);
  return i === -1 ? [message, ""] : [message.slice(0, i), message.slice(i + marker.length)];
}
