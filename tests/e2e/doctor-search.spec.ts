import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * USER-REQ-1 B/C: doctor search. With FRONTEND_ADAPTER=fixture the server serves labelled synthetic doctors;
 * with the default HTTP adapter the page must show the honest "not connected" state and no doctors.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";

test.describe("doctor search", () => {
  test("is axe-clean and keyboard reachable", async ({ page }) => {
    await page.goto("/en/doctors");
    await expect(page.getByRole("heading", { level: 1, name: "Find a doctor" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("never invents doctors over HTTP without a contract", async ({ page }) => {
    test.skip(FIXTURE, "HTTP adapter only");
    await page.goto("/en/doctors");
    await expect(page.getByText("Doctor search is not connected yet")).toBeVisible();
    await expect(page.getByTestId("doctor-card")).toHaveCount(0);
  });

  test("type-ahead groups suggestions and navigates by keyboard", async ({ page }) => {
    test.skip(!FIXTURE, "needs the synthetic fixture adapter");
    await page.goto("/en/doctors");
    const box = page.getByRole("combobox", { name: "Search doctors, specialities or symptoms" });
    await box.pressSequentially("child");
    const list = page.getByRole("listbox");
    await expect(list.getByRole("group", { name: "Specialities" })).toBeVisible();
    await expect(list.getByRole("group", { name: "Symptoms and conditions" })).toBeVisible();
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/en\/doctors\?speciality=paediatrics$/);
    await expect(page.getByTestId("doctor-card")).toHaveCount(1);
  });

  test("labels synthetic data, sorts, filters and keeps coordinates out of the URL", async ({ page, context }) => {
    test.skip(!FIXTURE, "needs the synthetic fixture adapter");
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 17.44, longitude: 78.35, accuracy: 137 });
    await page.goto("/en/doctors?showFull=1");
    await expect(page.getByText("Synthetic data, not live")).toBeVisible();
    await expect(page.getByText(/out of 5/)).toHaveCount(0);
    await expect(page.getByText("Doctors without a listed location are shown last.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Lowest fee" }).click();
    await expect(page).toHaveURL(/sort=fee_asc/);
    await page.getByRole("button", { name: "Use my location" }).click();
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText("17.4400, 78.3500 (±137 m)")).toBeVisible();
    await page.getByRole("button", { name: "Use this location" }).first().click();
    await expect(page.getByText(/Sorted by distance from your location: 17\.4400, 78\.3500/)).toBeVisible();
    expect(page.url()).not.toMatch(/17\.44|78\.35|lat|lng/);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await page.getByRole("button", { name: "Show on map" }).click();
    await expect(page.getByText("Map view is not available yet")).toBeVisible();
  });

  test("mobile filter drawer applies, cancels and clears", async ({ page }, info) => {
    test.skip(!FIXTURE || info.project.name !== "mobile-390", "mobile fixture only");
    await page.goto("/en/doctors");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Availability").selectOption("today");
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/en\/doctors$/);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("dialog").getByLabel("Availability").selectOption("today");
    await page.getByRole("dialog").getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/availability=today/);
    await page.getByRole("button", { name: "Filters (1)" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear all" }).click();
    await expect(page).toHaveURL(/\/en\/doctors$/);
  });

  test("profile shows public fields and a truthful booking state", async ({ page }) => {
    test.skip(!FIXTURE, "needs the synthetic fixture adapter");
    await page.goto("/en/doctors/00000000-0000-4000-8000-000000000102");
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic doctor 3" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request a visit" })).toBeDisabled();
    await expect(page.getByText("No open slots right now")).toBeVisible();
    await page.goto("/en/doctors/00000000-0000-4000-8000-000000009999");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Synthetic doctor 3");
  });
});
