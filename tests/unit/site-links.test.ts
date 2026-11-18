import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, getMessages } from "@/components/i18n/config";
import { SIGN_IN_HREF, SIGN_UP_HREF, footerGroups, headerLinks } from "@/components/site-links";
import { DEMO_HOME } from "@/lib/demo/auth-core";
import { categories } from "@/app/categories/data";

/*
 * Site-wide link audit. Builds the route table from the real files in src/app, then checks that
 * every header/footer link, every literal internal href in src/, and every demo role home resolves
 * to a route. Template-literal hrefs (for example `/providers/${id}`) are covered by the browser walk.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const APP = path.join(ROOT, "src/app");
const SRC = path.join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Route patterns from page files: route groups dropped, private _folders skipped, [param] becomes one segment. */
function routePatterns(): { route: string; re: RegExp }[] {
  const pages = walk(APP).filter((f) => /[\\/]page\.tsx?$/.test(f));
  const routes = pages
    .map((f) => path.relative(APP, path.dirname(f)).split(path.sep).filter(Boolean))
    .filter((segs) => !segs.some((s) => s.startsWith("_")))
    .map((segs) => "/" + segs.filter((s) => !/^\(.*\)$/.test(s)).join("/"));
  const metadataRoutes = ["/sitemap.xml", "/robots.txt"];
  return [...routes, ...metadataRoutes].map((route) => ({
    route,
    re: new RegExp("^" + route.replace(/\[\.\.\.[^\]]+\]/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+") + "/?$"),
  }));
}

const ROUTES = routePatterns();
const resolves = (href: string) => {
  const p = href.split(/[?#]/)[0] || "/";
  return ROUTES.some((r) => r.re.test(p));
};

/** Literal internal hrefs in source: href="/x", href={"/x"}, href: "/x", and redirect("/x"). */
function literalHrefs(): { file: string; href: string }[] {
  const files = walk(SRC).filter((f) => /\.(tsx?|mts)$/.test(f));
  const re = /(?:href=\{?|href:\s*|redirect\(|router\.push\()\s*["'`](\/[^"'`$]*)["'`]/g;
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(re)].map((m) => ({ file: path.relative(ROOT, file), href: m[1] }));
  });
}

describe("route table", () => {
  it("finds the public pages", () => {
    const routes = ROUTES.map((r) => r.route);
    for (const p of ["/", "/categories", "/faq", "/providers", "/sign-in", "/sign-up"]) expect(routes).toContain(p);
  });
});

describe("header and footer links", () => {
  for (const locale of LOCALES) {
    const m = getMessages(locale);
    it(`every ${locale} header and footer link resolves`, () => {
      const hrefs = [
        ...headerLinks(m.nav).map((l) => l.href),
        ...footerGroups(m).flatMap((g) => g.links.map((l) => l.href)),
        SIGN_IN_HREF,
        SIGN_UP_HREF,
      ];
      expect(hrefs.filter((h) => !resolves(h))).toEqual([]);
    });
    it(`every ${locale} link has a non-empty label`, () => {
      const labels = [...headerLinks(m.nav), ...footerGroups(m).flatMap((g) => g.links)].map((l) => l.label.trim());
      expect(labels.every(Boolean)).toBe(true);
    });
  }

  it("footer reaches every public page", () => {
    const footer = new Set(footerGroups(getMessages("en")).flatMap((g) => g.links.map((l) => l.href)));
    const privateGroups = ["(app)"];
    const internalAuth = ["/sign-out", "/verify", "/forgot-password"]; // reached from the auth flow, not the footer
    const publicStatic = walk(APP)
      .filter((f) => /[\\/]page\.tsx?$/.test(f))
      .map((f) => path.relative(APP, path.dirname(f)).split(path.sep).filter(Boolean))
      .filter((segs) => !segs.some((s) => privateGroups.includes(s) || s.startsWith("_") || s.startsWith("[")))
      .map((segs) => "/" + segs.filter((s) => !/^\(.*\)$/.test(s)).join("/"))
      .filter((r) => !internalAuth.includes(r));
    expect(publicStatic.filter((r) => !footer.has(r))).toEqual([]);
  });

  it("footer category links match real category slugs", () => {
    const slugs = new Set(categories.map((c) => c.slug));
    const catLinks = footerGroups(getMessages("en"))
      .flatMap((g) => g.links)
      .filter((l) => l.href.startsWith("/categories/"));
    expect(catLinks.map((l) => l.href.slice("/categories/".length)).filter((s) => !slugs.has(s as never))).toEqual([]);
    expect(catLinks).toHaveLength(categories.length);
  });
});

describe("source hrefs", () => {
  it("every literal internal href and redirect in src/ resolves to a route", () => {
    const found = literalHrefs();
    expect(found.length).toBeGreaterThan(20); // guards against the scan silently matching nothing
    const dead = found.filter((h) => !resolves(h.href));
    expect(dead).toEqual([]);
  }, 30_000);

  it("every demo role home is a real route", () => {
    expect(Object.values(DEMO_HOME).filter((h) => !resolves(h))).toEqual([]);
  });
});

describe("header account actions", () => {
  it("shows Sign in and Create account to guests, and Dashboard plus Sign out to a demo session", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AccountActions } = await import("@/components/site-shell");
    const m = getMessages("en");

    const guest = renderToStaticMarkup(createElement(AccountActions, { m, session: null }));
    expect(guest).toContain('href="/sign-in"');
    expect(guest).toContain('href="/sign-up"');
    expect(guest).not.toContain("Sign out");

    const session = { role: "doctor", name: "Demo", email: "d@example.invalid", home: "/provider", custom: false, demo: true } as const;
    const signedIn = renderToStaticMarkup(createElement(AccountActions, { m, session }));
    expect(signedIn).toContain('href="/provider"');
    expect(signedIn).toContain("Sign out");
    expect(signedIn).toContain("Demo: Doctor");
    expect(signedIn).not.toContain('href="/sign-up"');
  }, 60_000);
});
