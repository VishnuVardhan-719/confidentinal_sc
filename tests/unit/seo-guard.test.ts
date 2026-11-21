/**
 * R9-D9 SEO basics guard for the public site: unique localized titles and descriptions, one page per
 * PUBLIC_PAGES entry wired to its own metadata, canonical + hreflang en/te/hi + x-default, noindex
 * outside production and on every private or gated page, robots rules and the sitemap.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { PUBLIC_PAGES, SITEMAP_PAGES } from "@/components/public/routes";
import { alternatesFor, pageMetadata, SITE_URL } from "@/components/public/seo";
import { sitemapEntries } from "@/components/public/sitemap-entries";
import { LOCALES } from "@/i18n/routing";
import en from "@/messages/en/public.json";
import hi from "@/messages/hi/public.json";
import te from "@/messages/te/public.json";

const APP = join(process.cwd(), "src", "app", "[locale]");
const PUBLIC_DIR = join(APP, "(public)");
const META = { en: en.meta, te: te.meta, hi: hi.meta } as const;

afterEach(() => vi.unstubAllEnvs());

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pagesUnder(p) : n === "page.tsx" ? [p] : [];
  });
}

/** "(public)/about/page.tsx" -> "/about"; route groups are not in the URL. */
const routeOf = (file: string) => "/" + relative(PUBLIC_DIR, file).replace(/\\/g, "/").replace(/\/?page\.tsx$/, "");

describe("public page metadata", () => {
  // The directory pages (/doctors, /lab-tests, /ambulances, /caretakers) are not in PUBLIC_PAGES: each builds its own metadata with pageMetadata().
  const pages = pagesUnder(PUBLIC_DIR).filter((f) => !/\[/.test(relative(PUBLIC_DIR, f)) && !/^(doctors|lab-tests|ambulances|caretakers)[\\/]/.test(relative(PUBLIC_DIR, f)));
  const calls = pages.map((f) => {
    const m = /publicPageMetadata\("([A-Za-z]+)",\s*"([^"]+)"\)/.exec(readFileSync(f, "utf8"));
    return { file: relative(process.cwd(), f), route: routeOf(f).replace(/^\/$/, "/"), key: m?.[1], path: m?.[2] };
  });

  it("every public page calls publicPageMetadata with its own route, and covers PUBLIC_PAGES exactly", () => {
    for (const c of calls) {
      expect(c.key, c.file).toBeDefined();
      expect(c.path, c.file).toBe(c.route === "/" ? "/" : c.route);
    }
    expect(calls.map((c) => c.path).sort()).toEqual([...PUBLIC_PAGES].sort());
    expect(new Set(calls.map((c) => c.key)).size).toBe(calls.length);
  });

  for (const locale of LOCALES) {
    it(`${locale}: titles and descriptions exist, are unique and are not English copies`, () => {
      const meta = META[locale] as Record<string, { title: string; description: string }>;
      const keys = calls.map((c) => c.key!);
      const titles = keys.map((k) => meta[k]?.title);
      const descriptions = keys.map((k) => meta[k]?.description);
      expect(titles.every((t) => typeof t === "string" && t.trim().length > 0)).toBe(true);
      expect(descriptions.every((d) => typeof d === "string" && d.trim().length >= 40)).toBe(true);
      expect(new Set(titles).size, "duplicate titles").toBe(titles.length);
      expect(new Set(descriptions).size, "duplicate descriptions").toBe(descriptions.length);
      if (locale !== "en") {
        const enMeta = META.en as Record<string, { title: string; description: string }>;
        for (const k of keys) expect(meta[k].description, `${locale}.${k}`).not.toBe(enMeta[k].description);
      }
    });
  }
});

describe("canonical, hreflang and robots meta", () => {
  it("alternates give a self canonical plus en, te, hi and x-default", () => {
    for (const locale of LOCALES) {
      for (const path of PUBLIC_PAGES) {
        const a = alternatesFor(locale, path);
        const self = path === "/" ? `/${locale}` : `/${locale}${path}`;
        expect(a.canonical).toBe(self);
        expect(Object.keys(a.languages ?? {}).sort()).toEqual(["en", "hi", "te", "x-default"]);
        expect((a.languages as Record<string, string>)["x-default"]).toBe(path === "/" ? "/en" : `/en${path}`);
      }
    }
  });

  it("pages are noindex outside production and indexable only in production", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(pageMetadata({ locale: "en", path: "/about", title: "t", description: "d" }).robots).toMatchObject({ index: false });
    vi.stubEnv("APP_ENV", "production");
    expect(pageMetadata({ locale: "en", path: "/about", title: "t", description: "d" }).robots).toMatchObject({ index: true });
    expect(pageMetadata({ locale: "en", path: "/about", title: "t", description: "d", noindex: true }).robots).toMatchObject({ index: false });
  });

  it("robots.txt blocks everything outside production and private areas in production", () => {
    vi.stubEnv("APP_ENV", "test");
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    vi.stubEnv("APP_ENV", "production");
    const r = robots();
    const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules) as { disallow: string[] };
    for (const seg of ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"]) expect(rule.disallow).toContain(`/*/${seg}`);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("the sitemap lists every public page and the public directories, and nothing private", () => {
    const urls = sitemapEntries({ APP_ENV: "production" }).map((e) => e.url);
    for (const directory of ["/lab-tests", "/ambulances", "/caretakers"]) {
      expect(SITEMAP_PAGES).toContain(directory);
      for (const locale of LOCALES) expect(urls).toContain(`${SITE_URL}/${locale}${directory}`);
    }
    expect(urls.some((u) => u.includes("/lab-tests/") || u.includes("/ambulances/") || u.includes("/caretakers/"))).toBe(false);
    expect(urls.some((u) => /\/(patient|doctor|admin|verify)(\/|$)/.test(u))).toBe(false);
  });
});

describe("noindex on private and gated pages", () => {
  /** Nearest layout (up to [locale]) or the page itself declares noindex. */
  const declaresNoindex = (file: string) => /index:\s*false|noindex|privateMetadata\(/.test(readFileSync(file, "utf8"));
  const verifyNoindex = declaresNoindex(join(process.cwd(), "src", "components", "proof-of-visit", "verify-page.tsx"));

  it("every page outside (public) is noindex or only redirects", () => {
    const offenders = pagesUnder(APP)
      .filter((f) => !f.startsWith(PUBLIC_DIR))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        if (declaresNoindex(f)) return false;
        if (/generateMetadata = verifyMetadata/.test(src) && verifyNoindex) return false;
        // Pure redirect pages render nothing to index.
        if (/redirect\(/.test(src) && !/return\s*\(?\s*</.test(src)) return false;
        for (let dir = join(f, ".."); dir.startsWith(APP); dir = join(dir, "..")) {
          const layout = join(dir, "layout.tsx");
          if (existsSync(layout) && declaresNoindex(layout)) return false;
        }
        return true;
      })
      .map((f) => relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });

});
