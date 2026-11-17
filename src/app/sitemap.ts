import type { MetadataRoute } from "next";
import { SITE_URL, sitePages, type PublicPage } from "@/components/marketing/site";
import { categories } from "./categories/data";

// Draft legal pages are noindex and left out until the owner and a lawyer approve them.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: readonly PublicPage[] = Object.values(sitePages);
  const paths = [
    "/",
    "/how-it-works",
    "/categories",
    ...categories.map((c) => `/categories/${c.slug}`),
    ...pages.filter((p) => !p.draft).map((p) => p.path),
  ];
  return paths.map((path) => ({ url: new URL(path, SITE_URL).toString() }));
}
