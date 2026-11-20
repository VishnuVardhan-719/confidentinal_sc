/**
 * R9-D9: public-site keyboard, screen-reader, long-string, finder-state and SEO checks. Runs in the
 * mobile-390 and desktop-1280 projects against the public server (http adapter, no fixtures).
 * Directory filter drawers (/doctors, /lab-tests) are built on feat/fe2-c and are not on this branch.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import en from "../../src/messages/en/public.json";
import hi from "../../src/messages/hi/public.json";
import te from "../../src/messages/te/public.json";
import enErrors from "../../src/messages/en/errors.json";
import hiErrors from "../../src/messages/hi/errors.json";
import teErrors from "../../src/messages/te/errors.json";

const LOCALES = ["en", "te", "hi"] as const;
type Locale = (typeof LOCALES)[number];
const MSG = { en, te, hi } as const;
const ERR = { en: enErrors, te: teErrors, hi: hiErrors } as const;
const PAGES = ["", "/about", "/our-story", "/stories", "/how-it-works", "/faq", "/contact", "/privacy", "/terms", "/refunds", "/become-a-provider", "/memberships", "/emergency"] as const;

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function expectNoAxeViolations(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) b = b.include(include);
  const r = await b.analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Wait until React owns the page (client handlers attached). */
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
}

type Stop = { label: string; visible: boolean; ring: boolean; hidden: boolean; inHeader: boolean; inDialog: boolean; x: number; y: number };

/** Describe the focused element: visible, has a visible focus indicator, not inside aria-hidden. */
function describeFocus(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { label: "body", visible: false, ring: false, hidden: false, inHeader: false, inDialog: false, x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
    const shadow = cs.boxShadow !== "none" && cs.boxShadow !== "";
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`,
      visible: r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh,
      ring: outline || shadow,
      hidden: !!el.closest('[aria-hidden="true"], [inert]'),
      inHeader: !!el.closest("header"),
      inDialog: !!el.closest('[role="dialog"]'),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    };
  });
}

/** Elements that run past the viewport (outside intentional scrollers) or clip their own text. */
function layoutProblems(page: Page, scope = "body"): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [`no ${sel}`];
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const scrollerAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className?.toString?.() ?? "").split(" ").slice(0, 3).join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    for (const el of root.querySelectorAll("*")) {
      if (el.closest(".sr-only, svg, [hidden]")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if ((r.right > vw + 1 || r.left < -1) && !scrollerAncestor(el)) out.push(`past viewport (${Math.round(r.left)}..${Math.round(r.right)} of ${vw}): ${name(el)}`);
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (!ownText) continue;
      const he = el as HTMLElement;
      if (/(hidden|clip)/.test(cs.overflowX) && he.scrollWidth > he.clientWidth + 1) out.push(`text clipped horizontally: ${name(el)}`);
      if (/(hidden|clip)/.test(cs.overflowY) && he.scrollHeight > he.clientHeight + 2) out.push(`text clipped vertically: ${name(el)}`);
    }
    if (document.documentElement.scrollWidth > vw) out.push(`document scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
    return [...new Set(out)].slice(0, 15);
  }, scope);
}

// -------------------------------------------------------------------------------------------------
// 1. Keyboard and screen reader
// -------------------------------------------------------------------------------------------------
for (const locale of LOCALES) {
  test.describe(`${locale}: keyboard`, () => {
    test("skip link is the first stop, shows on focus and moves focus into main", async ({ page }) => {
      await page.goto(`/${locale}/about`);
      await hydrated(page);
      await page.keyboard.press("Tab");
      const first = await describeFocus(page);
      expect(first.label).toMatch(/^a /);
      expect(first.visible, "skip link visible when focused").toBe(true);
      expect(first.ring).toBe(true);
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main-content");
    });

    test("header tab stops are visible, in reading order and show a focus ring", async ({ page }) => {
      await page.goto(`/${locale}`);
      await hydrated(page);
      await page.keyboard.press("Tab"); // skip link
      const stops: Stop[] = [];
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        const s = await describeFocus(page);
        if (!s.inHeader) break;
        stops.push(s);
      }
      expect(stops.length).toBeGreaterThanOrEqual(isMobile(page) ? 3 : 8);
      for (const s of stops) {
        expect(s.visible, `${s.label} visible`).toBe(true);
        expect(s.ring, `${s.label} focus ring`).toBe(true);
        expect(s.hidden, `${s.label} inside aria-hidden`).toBe(false);
      }
      // One header row: focus moves left to right.
      for (let i = 1; i < stops.length; i++) expect(stops[i].x, `${stops[i - 1].label} -> ${stops[i].label}`).toBeGreaterThan(stops[i - 1].x);
    });

    test("desktop: services and language menus work by keyboard and restore focus", async ({ page }) => {
      test.skip(isMobile(page), "desktop header only");
      await page.goto(`/${locale}/how-it-works`);
      await hydrated(page);
      const services = page.locator("header nav button").first();
      await services.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
      expect((await describeFocus(page)).ring, "menu item focus ring").toBe(true);
      await page.keyboard.press("ArrowDown");
      expect((await describeFocus(page)).ring).toBe(true);
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(services).toBeFocused();

      const lang = page.locator("header button").filter({ has: page.locator(`span[lang="${locale}"]`) });
      await lang.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();
      await expect(lang).toBeFocused();
      // Choose another language with the keyboard only.
      const target: Locale = locale === "en" ? "te" : "en";
      await page.keyboard.press("Enter");
      const item = page.locator(`[role="menuitem"][lang="${target}"]`);
      await expect(item).toBeVisible();
      for (let i = 0; i < 4; i++) {
        if (await item.evaluate((el) => el === document.activeElement).catch(() => false)) break;
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/${target}/how-it-works$`));
      await expect(page.locator("html")).toHaveAttribute("lang", target);
    });

    test("mobile: menu dialog traps focus, has a name, and restores focus on Escape and Close", async ({ page }) => {
      test.skip(!isMobile(page), "mobile header only");
      await page.goto(`/${locale}/faq`);
      await hydrated(page);
      const trigger = page.locator("header").getByRole("button");
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleName(/.+/);
      await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      for (const key of ["Tab", "Shift+Tab"]) {
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press(key);
          const s = await describeFocus(page);
          expect(s.inDialog, `${key} #${i} left the dialog: ${s.label}`).toBe(true);
          expect(s.ring, `${s.label} focus ring`).toBe(true);
        }
      }
      expect(await layoutProblems(page, '[role="dialog"]')).toEqual([]);
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole("button").first();
      await close.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("finder works by keyboard only", async ({ page }) => {
      await page.goto(`/${locale}`);
      await hydrated(page);
      const form = page.locator("form:has(input[name=pin])").first();
      await form.locator("input[name=pin]").focus();
      await page.keyboard.type("500001");
      await page.keyboard.press("Tab");
      // Arrow keys move through the native radio group and select; the group is one tab stop.
      await page.keyboard.press("ArrowDown");
      await expect(form.locator("input[name=service]:checked")).toHaveCount(1);
      const chosen = await form.locator("input[name=service]:checked").getAttribute("value");
      await page.keyboard.press("Tab");
      await expect(form.locator("button[type=submit]")).toBeFocused();
      await page.keyboard.press("Enter");
      const href = { doctors: "doctors", labTests: "lab-tests", ambulances: "ambulances", caretakers: "caretakers" }[chosen as "doctors"];
      await expect(page).toHaveURL(new RegExp(`/${locale}/${href}\\?pin=500001$`));
    });
  });
}

// -------------------------------------------------------------------------------------------------
// 2. Long strings: every public page, every locale, header + main + footer, no overflow or clipping
// -------------------------------------------------------------------------------------------------
test.describe("long strings: no overflow or clipped text", () => {
  for (const locale of LOCALES) {
    for (const path of PAGES) {
      test(`${locale}${path || "/"}`, async ({ page }) => {
        await page.goto(`/${locale}${path}`);
        await hydrated(page);
        expect(await layoutProblems(page)).toEqual([]);
      });
    }
    test(`${locale}: finder with every error shown`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await hydrated(page);
      const form = page.locator("form:has(input[name=pin])").first();
      await form.locator("button[type=submit]").click();
      await expect(form.getByText(MSG[locale].landing.finder.errors.pinRequired)).toBeVisible();
      expect(await layoutProblems(page, "form:has(input[name=pin])")).toEqual([]);
    });
    test(`${locale}: localized 404 page`, async ({ page }) => {
      await page.goto(`/${locale}/no-such-page-${"x".repeat(60)}`);
      expect(await layoutProblems(page)).toEqual([]);
    });
  }
});

// -------------------------------------------------------------------------------------------------
// 3. Finder error, empty and offline states
// -------------------------------------------------------------------------------------------------
test.describe("finder states", () => {
  for (const locale of LOCALES) {
    const errors = MSG[locale].landing.finder.errors;

    test(`${locale}: offline submit keeps the input and says why`, async ({ page, context }) => {
      await page.goto(`/${locale}`);
      await hydrated(page);
      const form = page.locator("form:has(input[name=pin])").first();
      await form.locator("input[name=pin]").fill("500001");
      await form.locator("label:has(input[value=labTests])").click();
      await context.setOffline(true);
      await form.locator("button[type=submit]").click();
      await expect(form.getByRole("alert")).toHaveText(errors.offline);
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(form.locator("input[name=pin]")).toHaveValue("500001");
      await expect(form.locator("input[value=labTests]")).toBeChecked();
      await expectNoAxeViolations(page);
      await context.setOffline(false);
      await form.locator("button[type=submit]").click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/lab-tests\\?pin=500001$`));
    });

    test(`${locale}: an unusable /find link returns to the finder and explains it`, async ({ page }) => {
      await page.goto(`/${locale}/find?pin=12&service=pharmacy`);
      await expect(page).toHaveURL(new RegExp(`/${locale}#finder$`));
      const form = page.locator("form:has(input[name=pin])").first();
      await expect(form.getByRole("alert")).toHaveText(errors.invalidLink);
      // The flag is dropped from the URL, so a reload or share does not repeat it.
      expect(new URL(page.url()).searchParams.get("finder")).toBeNull();
      await form.locator("input[name=pin]").fill("500001");
      await form.locator("label:has(input[value=doctors])").click();
      await form.locator("button[type=submit]").click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/doctors\\?pin=500001$`));
    });

    test(`${locale}: FAQ search with no matches shows the empty state and recovers`, async ({ page }) => {
      await page.goto(`/${locale}/faq`);
      await hydrated(page);
      const box = page.getByRole("searchbox");
      await box.fill("qwertyuiop zzzz");
      await expect(page.getByText(MSG[locale].faqPage.noResultsTitle)).toBeVisible();
      await expect(page.locator("details")).toHaveCount(0);
      expect(await layoutProblems(page)).toEqual([]);
      await box.fill("");
      await expect(page.locator("details").first()).toBeVisible();
    });
  }

  test("valid /find links redirect with a relative 303", async ({ request }) => {
    const res = await request.get("/hi/find?pin=500001&service=caretakers", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("/hi/caretakers?pin=500001");
  });
});

// -------------------------------------------------------------------------------------------------
// 4. SEO basics (non-production build: every page must also be noindex)
// -------------------------------------------------------------------------------------------------
test.describe("SEO basics", () => {
  for (const locale of LOCALES) {
    test(`${locale}: unique title and description, canonical, hreflang en/te/hi/x-default, noindex`, async ({ page }) => {
      const titles = new Map<string, string>();
      const descriptions = new Map<string, string>();
      for (const path of PAGES) {
        await page.goto(`/${locale}${path}`);
        const self = `/${locale}${path}`;
        const title = await page.title();
        const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
        expect(title.trim(), `${self} title`).not.toBe("");
        expect(description.length, `${self} description`).toBeGreaterThanOrEqual(40);
        expect(titles.get(title), `duplicate title "${title}"`).toBeUndefined();
        expect(descriptions.get(description), `duplicate description on ${self}`).toBeUndefined();
        titles.set(title, self);
        descriptions.set(description, self);
        expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "", "http://x").pathname).toBe(self);
        for (const l of [...LOCALES, "x-default"]) {
          const href = await page.locator(`link[rel="alternate"][hreflang="${l}"]`).getAttribute("href");
          const want = `/${l === "x-default" ? "en" : l}${path}`;
          expect(new URL(href ?? "", "http://x").pathname, `${self} hreflang ${l}`).toBe(want);
        }
        await expect(page.locator('meta[name="robots"][content*="noindex"]'), `${self} noindex outside production`).not.toHaveCount(0);
      }
    });

    test(`${locale}: 404 page has its own title and is noindex`, async ({ page }) => {
      await page.goto(`/${locale}/no-such-page`);
      await expect(page).toHaveTitle(new RegExp(ERR[locale].notFound.metaTitle));
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).not.toHaveCount(0);
    });
  }

  test("robots.txt blocks crawling outside production", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toMatch(/User-Agent: \*\s+Disallow: \//i);
  });
});
