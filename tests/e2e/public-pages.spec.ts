import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Public, static pages. The ambulance category slug is "scheduled-ambulance" (planned transport only).
const PUBLIC_PAGES = [
  "/",
  "/how-it-works",
  "/categories",
  "/categories/doctor",
  "/categories/lab",
  "/categories/scheduled-ambulance",
  "/categories/caretaker",
] as const;

/** Collects console errors and uncaught page errors from the moment it is attached. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

for (const path of PUBLIC_PAGES) {
  test.describe(`public page ${path}`, () => {
    test("structure, skip link, layout and console are clean", async ({ page }) => {
      const errors = trackErrors(page);

      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), "HTTP status").toBe(200);
      await page.waitForLoadState("networkidle");

      // Exactly one h1.
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();

      // Landmarks: one banner, one main, one contentinfo, and the labelled main navigation.
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Main", exact: true })).toHaveCount(1);

      // Skip link is the first tab stop, becomes visible on focus and moves focus to main.
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content" });
      await expect(skip).toBeFocused();
      await expect(skip).toHaveAttribute("href", "#main-content");
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.locator("main#main-content")).toBeFocused();

      // No horizontal scroll at this viewport.
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      expect(overflow.scrollWidth, "document scrollWidth vs clientWidth").toBeLessThanOrEqual(overflow.clientWidth);

      expect(errors, "console / page errors").toEqual([]);
    });

    test("axe: no serious or critical violations", async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        // Next.js dev-mode overlay/indicator is not part of the product UI.
        .exclude("nextjs-portal")
        .analyze();

      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          targets: v.nodes.map((n) => n.target.join(" ")),
        }));

      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  });
}

test("scheduled ambulance page states it is not an emergency service", async ({ page }) => {
  await page.goto("/categories/scheduled-ambulance");
  await expect(page.locator("main")).toContainText(/not an emergency service/i);
  await expect(page.locator("main")).toContainText("112");
});
