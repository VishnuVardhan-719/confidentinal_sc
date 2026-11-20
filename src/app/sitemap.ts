import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/components/public/sitemap-entries";

/** Public, published pages only, in every locale with hreflang alternates. Empty outside production. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
