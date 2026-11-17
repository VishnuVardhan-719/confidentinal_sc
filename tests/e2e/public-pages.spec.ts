import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

// Public, static pages. The ambulance category slug is "scheduled-ambulance" (planned transport only).
// axe runs for every route in a11y-routes.spec.ts.
const PUBLIC_PAGES = [
  "/",
  "/how-it-works",
  "/categories",
  "/categories/doctor",
  "/categories/lab",
  "/categories/scheduled-ambulance",
  "/categories/caretaker",
] as const;

for (const path of PUBLIC_PAGES) {
  test(`public page ${path}: structure, skip link, layout and console are clean`, async ({ page }) => {
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

    await expectNoHorizontalScroll(page);
    expect(errors, "console / page errors").toEqual([]);
  });
}

test("scheduled ambulance page states it is not an emergency service", async ({ page }) => {
  await page.goto("/categories/scheduled-ambulance");
  await expect(page.locator("main")).toContainText(/not an emergency service/i);
  await expect(page.locator("main")).toContainText("112");
});

test("unknown category returns 404", async ({ page }) => {
  const response = await page.goto("/categories/does-not-exist");
  expect(response?.status()).toBe(404);
});
