import type { Metadata } from "next";
import { SITE_NAME, sitePages, type SitePageKey } from "./site";

/** Per-page title, description, canonical URL and Open Graph/Twitter cards. Drafts are noindex. */
export function pageMetadata(key: SitePageKey, title: string, description: string): Metadata {
  const page = sitePages[key];
  const draft = "draft" in page && page.draft;
  return {
    title,
    description,
    alternates: { canonical: page.path },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: page.path,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: "website",
    },
    twitter: { card: "summary", title: `${title} | ${SITE_NAME}`, description },
    ...(draft ? { robots: { index: false, follow: true } } : {}),
  };
}
