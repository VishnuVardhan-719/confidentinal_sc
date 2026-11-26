import type { MetadataRoute } from "next";
import { SITEMAP_PAGES } from "@/components/public/routes";
import { PRELAUNCH_OPEN_PAGES, isPrelaunch } from "@/lib/launch-mode";
import { SITE_URL, isIndexable, localizedPath } from "@/components/public/seo";
import { LOCALES } from "@/i18n/routing";

/** Sitemap entries for every SITEMAP_PAGES path in every locale, with hreflang alternates. Empty outside production. */
export function sitemapEntries(env: Record<string, string | undefined> = process.env): MetadataRoute.Sitemap {
  if (!isIndexable(env)) return [];
  const pages: readonly string[] = isPrelaunch(env) ? PRELAUNCH_OPEN_PAGES : SITEMAP_PAGES;
  return pages.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}${localizedPath(locale, path)}`,
      alternates: {
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localizedPath(l, path)}`])),
          "x-default": `${SITE_URL}${localizedPath("en", path)}`,
        },
      },
    })),
  );
}
