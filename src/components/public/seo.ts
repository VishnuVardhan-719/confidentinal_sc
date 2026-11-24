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

/** Share-card images (1200x630). The file-based opengraph-image sits outside the [locale] layout, so the tags are set here. */
export const SHARE_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "SureCureVisit: healthcare at your doorstep" };
export const TWITTER_IMAGE = { url: "/twitter-image.png", width: 1200, height: 630, alt: SHARE_IMAGE.alt };

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
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [TWITTER_IMAGE] },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
  };
}
