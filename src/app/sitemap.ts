import type { MetadataRoute } from "next";
import { PUBLIC_PAGES } from "@/components/public/routes";
import { SITE_URL, isIndexable, localizedPath } from "@/components/public/seo";
import { LOCALES } from "@/i18n/routing";

/** Public, published pages only, in every locale with hreflang alternates. Empty outside production. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexable()) return [];
  return PUBLIC_PAGES.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}${localizedPath(locale, path)}`,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localizedPath(l, path)}`])),
      },
    })),
  );
}
