/**
 * fe-p R8 accessibility sweep over every patient route fe-p owns, in each browser project
 * (mobile-390 and desktop-1280):
 *   - axe (WCAG 2.1 A/AA): no serious or critical violations; on the dashboard and detail pages
 *     (STRICT_ROUTES) moderate violations fail too
 *   - the notification inbox is also swept in te and hi
 *   - no horizontal scroll
 *   - the first Tab stop is visible and has a focus ring (outline >= 2px or a box-shadow ring)
 * Runs against a session-mode fixture server (E2E_FEP_MODE=session); with E2E_FEP_CLINICAL=on the
 * stores are seeded, with off they are empty or gated, so both runs cover different states.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const MODE = process.env.E2E_FEP_MODE;

const ROUTES = [
  "/patient/dashboard",
  "/patient/bookings",
  "/patient/bookings/00000000-0000-4000-8000-000000000061",
  "/patient/records",
  "/patient/records/00000000-0000-4000-8000-000000000202",
  "/patient/notifications",
  "/patient/family",
  "/patient/family/new",
  "/patient/family/00000000-0000-4000-8000-0000000000f1",
  "/patient/saved",
  "/patient/reviews",
  "/patient/reviews/00000000-0000-4000-8000-0000000002a2",
  "/patient/reviews/00000000-0000-4000-8000-0000000002a7/edit",
  "/patient/settings/reminders",
];

/** Dashboard and detail pages: moderate axe issues fail as well as serious and critical ones. */
const STRICT_ROUTES = new Set([
  "/patient/dashboard",
  "/patient/bookings/00000000-0000-4000-8000-000000000061",
  "/patient/records/00000000-0000-4000-8000-000000000202",
  "/patient/family/00000000-0000-4000-8000-0000000000f1",
  "/patient/reviews/00000000-0000-4000-8000-0000000002a2",
  "/patient/reviews/00000000-0000-4000-8000-0000000002a7/edit",
]);

const LOCALIZED: [string, string][] = [
  ["te", "/patient/notifications"],
  ["hi", "/patient/notifications"],
];
const failing = (route: string) => (STRICT_ROUTES.has(route) || route === "/patient/notifications" ? ["moderate", "serious", "critical"] : ["serious", "critical"]);

test.describe("fe-p patient routes a11y sweep", () => {
  test.skip(MODE !== "session", "needs a session-mode fixture server");

  for (const [locale, route] of [...ROUTES.map((r): [string, string] => ["en", r]), ...LOCALIZED]) {
    test(`a11y ${locale}${route}`, async ({ page }) => {
      await page.goto(`/${locale}${route}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const blocking = results.violations
        .filter((v) => failing(route).includes(v.impact ?? ""))
        .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(blocking).toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { ok: false, why: "nothing focused" };
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== "none" && cs.boxShadow !== "");
        const onScreen = b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth;
        return { ok: ring && onScreen, why: `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ring=${ring} onScreen=${onScreen}` };
      });
      expect(focus.ok, focus.why).toBe(true);
    });
  }
  test("dashboard and shell nav reach every R7 patient page", async ({ page }) => {
    for (const start of ["/en/patient/dashboard", "/en/patient/bookings"]) {
      await page.goto(start);
      if ((page.viewportSize()?.width ?? 1280) < 1024) {
        const menu = page.getByRole("button", { name: "Open menu" });
        await expect(async () => {
          if (!(await page.getByRole("dialog").isVisible())) await menu.click();
          await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
        }).toPass();
      }
      for (const [name, href] of [["Family", "/en/patient/family"], ["Saved doctors", "/en/patient/saved"], ["Reviews", "/en/patient/reviews"], ["Reminders", "/en/patient/settings/reminders"]]) {
        await expect(page.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", href);
      }
    }
  });
});
/**
 * R9-P2 final sweep with the overlay open, notifications and reminders, en/te/hi. Under 1024px the
 * shell menu is a modal sheet (role dialog); at 1280 these pages have no dialog, so the open overlay
 * is the language menu. Moderate axe issues fail here. Checks: focus moves into the overlay, nothing
 * overflows, Escape closes it and focus returns to the trigger. Triggers are found by aria-haspopup,
 * so the test does not depend on translated labels.
 */
test.describe("fe-p notifications and reminders a11y with overlays open", () => {
  test.skip(MODE !== "session", "needs a session-mode fixture server");

  for (const locale of ["en", "te", "hi"]) {
    for (const route of ["/patient/notifications", "/patient/settings/reminders"]) {
      test(`overlay a11y ${locale}${route}`, async ({ page }) => {
        await page.goto(`/${locale}${route}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        const narrow = (page.viewportSize()?.width ?? 1280) < 1024;
        const kind = narrow ? "dialog" : "menu";
        const trigger = page.locator(`header button[aria-haspopup="${kind}"]:visible`);
        await expect(trigger).toHaveCount(1);
        const overlay = page.getByRole(kind);
        // A click before hydration does nothing; retry until the overlay opens.
        await expect(async () => {
          if (!(await overlay.isVisible())) await trigger.click();
          await expect(overlay).toBeVisible({ timeout: 1000 });
        }).toPass();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect.poll(() => overlay.evaluate((el) => el.contains(document.activeElement))).toBe(true);

        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        // Radix's modal language menu aria-hides the page behind it, and axe reports the page's
        // focusable controls (aria-hidden-focus). That is only harmless while focus cannot leave the
        // menu, so the exception applies to the menu case alone and the trap is checked below.
        // Logged for fe-a as REQUESTS R-FE-P-R9-2 (non-modal menu would remove it).
        const menuHidesPage = (v: { id: string }) => !narrow && v.id === "aria-hidden-focus";
        const blocking = results.violations
          .filter((v) => ["moderate", "serious", "critical"].includes(v.impact ?? "") && !menuHidesPage(v))
          .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
        expect(blocking).toEqual([]);
        if (results.violations.some(menuHidesPage)) {
          test.info().annotations.push({ type: "known", description: "aria-hidden-focus behind the modal language menu (R-FE-P-R9-2)" });
          for (const key of ["Tab", "Shift+Tab"]) {
            await page.keyboard.press(key);
            await expect(overlay).toBeVisible();
            expect(await overlay.evaluate((el) => el.contains(document.activeElement)), `${key} must not leave the menu`).toBe(true);
          }
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);

        await page.keyboard.press("Escape");
        await expect(overlay).toBeHidden();
        await expect(trigger).toBeFocused();
      });
    }
  }
});