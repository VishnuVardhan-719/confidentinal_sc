import { expect, test } from "@playwright/test";

/** Public lab directory (/lab-tests): search by test and city, open a lab, see prices and collection, go to request. */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
test.skip(!FIXTURE, "needs the synthetic fixture adapter");

test.describe("public lab directory", () => {
  test("search by test and city, open a lab, and reach the request form", async ({ page }) => {
    await page.goto("/en/lab-tests");
    await expect(page.getByRole("heading", { level: 1, name: "Find a lab test" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTestId("lab-card").filter({ visible: true })).toHaveCount(3);
    await page.getByLabel("Test name").fill("blood count");
    await page.getByLabel("City").selectOption("Secunderabad");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/en\/lab-tests\?test=blood\+count&city=Secunderabad$/);
    const cards = page.getByTestId("lab-card").filter({ visible: true });
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Synthetic lab 2");
    await expect(cards).toContainText("Matching tests");
    await expect(cards).toContainText("₹300.00");
    await expect(cards).not.toContainText("Lipid profile");
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/lab-tests$/);
    await page.getByRole("link", { name: "View lab: Synthetic lab 1" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic lab 1" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("lab-test")).toHaveCount(4);
    await expect(page.getByTestId("lab-test").filter({ hasText: "Fasting blood sugar" })).toContainText("Do not eat for 10 hours before. Water is fine.");
    await expect(page.getByTestId("lab-test").filter({ hasText: "Fasting blood sugar" })).toContainText("₹150.00");
    const collection = page.getByRole("complementary", { name: "Sample collection" });
    await expect(collection).toContainText("Home sample collection");
    await expect(collection).toContainText("Walk-in at the lab");
    await expect(collection).toContainText("Home collection fee: ₹100.00");
    const request = page.getByRole("link", { name: "Request tests from Synthetic lab 1" });
    await expect(request).toHaveAttribute("href", "/en/patient/lab-tests/request?providerId=00000000-0000-4000-8200-000000000001");
    await request.click();
    await expect(page.getByRole("heading", { level: 1, name: "Request tests from Synthetic lab 1" })).toBeVisible({ timeout: 20_000 });
  });

  test("canonical and hreflang metadata; lab pages are not indexed", async ({ page }) => {
    await page.goto("/te/lab-tests");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/te\/lab-tests$/);
    await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute("href", /\/hi\/lab-tests$/);
    await page.goto("/en/lab-tests/00000000-0000-4000-8200-000000000001");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/lab-tests\/00000000-0000-4000-8200-000000000001$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("keyboard: filter and open a lab without a pointer", async ({ page }) => {
    await page.goto("/en/lab-tests");
    await expect(page.getByRole("heading", { level: 1, name: "Find a lab test" })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Test name").focus();
    await page.keyboard.type("thyroid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/test=thyroid/);
    const link = page.getByRole("link", { name: "Synthetic lab 1", exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic lab 1" })).toBeVisible({ timeout: 20_000 });
  });
});
