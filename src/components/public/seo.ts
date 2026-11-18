import type { Metadata } from "next";
import { LOCALES, type AppLocale } from "@/i18n/routing";

/** Canonical production origin (DESIGN.md / README). */
export const SITE_URL = "https://surecurevisit.in";

/** Only the production deployment is indexable; staging/preview builds are noindex (plus real auth). */
export function isIndexable(env: Record<string, string | undefined> = process.env): boolean {
  return env.APP_ENV === "production";
}

export function localizedPath(locale: AppLocale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** canonical + hreflang alternates (relative; resolved against metadataBase). */
export function alternatesFor(locale: AppLocale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = localizedPath(l, path);
  languages["x-default"] = localizedPath("en", path);
  return { canonical: localizedPath(locale, path), languages };
}

export function pageMetadata({
  locale,
  path,
  title,
  description,
  noindex = false,
}: {
  locale: AppLocale;
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}): Metadata {
  const index = !noindex && isIndexable();
  return {
    title,
    description,
    alternates: alternatesFor(locale, path),
    openGraph: {
      title,
      description,
      url: localizedPath(locale, path),
      siteName: "SureCure Visit",
      locale: { en: "en_IN", te: "te_IN", hi: "hi_IN" }[locale],
      type: "website",
    },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
  };
}
