import { describe, expect, it } from "vitest";
import { PUBLIC_PAGES, SITEMAP_PAGES } from "@/components/public/routes";
import { sitemapEntries } from "@/components/public/sitemap-entries";
import { SITE_URL } from "@/components/public/seo";
import { LOCALES } from "@/i18n/routing";

const PROD = { APP_ENV: "production" };

describe("sitemap", () => {
  it("is empty outside production", () => {
    expect(sitemapEntries({ APP_ENV: "staging" })).toEqual([]);
    expect(sitemapEntries({})).toEqual([]);
  });

  it("lists /lab-tests in every locale with hreflang alternates", () => {
    const entries = sitemapEntries(PROD);
    for (const locale of LOCALES) {
      const entry = entries.find((e) => e.url === `${SITE_URL}/${locale}/lab-tests`);
      expect(entry, locale).toBeDefined();
      expect(entry?.alternates?.languages).toEqual({
        ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/lab-tests`])),
        "x-default": `${SITE_URL}/en/lab-tests`,
      });
    }
  });

  it("lists the doctors directory", () => {
    expect(sitemapEntries(PROD).some((e) => e.url === `${SITE_URL}/en/doctors`)).toBe(true);
  });

  it("keeps every public page and adds no duplicates or detail pages", () => {
    for (const page of PUBLIC_PAGES) expect(SITEMAP_PAGES).toContain(page);
    expect(new Set(SITEMAP_PAGES).size).toBe(SITEMAP_PAGES.length);
    const urls = sitemapEntries(PROD).map((e) => e.url);
    expect(urls).toHaveLength(SITEMAP_PAGES.length * LOCALES.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.some((u) => /\/lab-tests\/./.test(u))).toBe(false);
  });
});
