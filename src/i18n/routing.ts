import { defineRouting } from "next-intl/routing";

export const LOCALES = ["en", "te", "hi"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  // Preference cookie holds only the locale code. No personal data.
  localeCookie: { name: "SCV_LOCALE", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" },
});

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** BCP-47 tags used for Intl formatting and hreflang. */
export const LOCALE_TAGS: Record<AppLocale, string> = {
  en: "en-IN",
  te: "te-IN",
  hi: "hi-IN",
};
