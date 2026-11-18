import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility sweep over every public route that exists on this branch:
 * axe (WCAG 2.1 A/AA) at 360/768/1024/1440 in en/te/hi (390 and 1280 are covered by public.spec),
 * 200% text size without horizontal scrolling, visible keyboard focus, and security headers.
 * Runs once (desktop project) and sets each viewport itself.
 */
const LOCALES = ["en", "te", "hi"] as const;
const ROUTES = ["", "/about", "/our-story", "/stories", "/how-it-works", "/faq", "/contact", "/privacy", "/terms", "/refunds", "/become-a-provider", "/memberships", "/emergency", "/no-such-page"];
const WIDTHS = [360, 768, 1024, 1440];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "sweep runs once and sets its own viewports");
});

async function axe(page: Page) {
  // Runtime 404s stream as an error shell that the client replaces; audit the hydrated page.
  await page.waitForFunction(() => document.documentElement.lang !== "");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    test(`axe ${locale} @${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      const failures: string[] = [];
      for (const route of ROUTES) {
        await page.goto(`/${locale}${route}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) failures.push(`${route || "/"}: horizontal overflow ${overflow}px`);
        for (const v of await axe(page)) failures.push(`${route || "/"}: ${v}`);
      }
      expect(failures).toEqual([]);
    });
  }
}

/**
 * Browser zoom at 200% on a 1280px window gives a 640 CSS px viewport; 400% (WCAG 1.4.10 reflow)
 * gives 320 CSS px. Content must reflow without horizontal scrolling at both.
 */
for (const [zoom, width] of [["200%", 640], ["400%", 320]] as const) {
  test(`zoom ${zoom} reflows without horizontal scrolling`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width, height: 450 }, deviceScaleFactor: 1280 / width });
    const page = await context.newPage();
    const failures: string[] = [];
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        await page.goto(`/${locale}${route}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) failures.push(`${locale}${route || "/"}: ${overflow}px`);
      }
    }
    await context.close();
    expect(failures).toEqual([]);
  });
}

test("keyboard focus is always visible and never trapped on the landing page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en");
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        key: `${el.tagName}:${el.getAttribute("href") ?? el.getAttribute("name") ?? el.id ?? el.textContent?.slice(0, 20)}`,
        outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2,
        ring: s.boxShadow !== "none",
        visible: r.width > 0 && r.height > 0,
      };
    });
    if (!info) continue;
    expect(info.visible, info.key).toBe(true);
    expect(info.outline || info.ring, `no visible focus on ${info.key}`).toBe(true);
    seen.add(info.key);
  }
  expect(seen.size).toBeGreaterThan(25);
});

test("security headers are sent", async ({ request }) => {
  const res = await request.get("/en");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).not.toMatch(/script-src[^;]*https?:/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
});
