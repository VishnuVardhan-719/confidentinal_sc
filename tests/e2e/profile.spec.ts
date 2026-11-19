import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, COPY, expectCleanUrl, expectNoPrivateBrowserStorage, signIn, visible } from "./support/identity";

/**
 * USER-REQ-1 D: patient profile at a glance, health profile form and 13-item readiness, on the
 * SYNTHETIC fixture adapter. Fixture drafts are dev-server memory, so this suite runs serially
 * and expects a freshly started server (patient.new starts at 6 of 13).
 */
test.describe.configure({ mode: "serial" });

test.describe("patient profile at a glance", () => {
  test("signed-out visitors are sent to sign in with a safe return path", async ({ page }) => {
    await page.goto("/en/patient/profile", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/en/login?next=%2Fen%2Fpatient%2Fprofile");
  });

  test("shows identity and a separate, unverified health record with missing items", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/profile");
    await expect(page).toHaveURL("/en/patient/profile");
    const banner = visible(page.getByTestId("profile-completion"));
    await expect(banner).toContainText("of 13 complete");
    await expect(page.getByRole("heading", { name: "Health record" })).toBeVisible();
    await expect(page.getByText("Unverified", { exact: true })).toBeVisible();
    await expect(page.getByText(/stays unverified until a doctor confirms it/i).first()).toBeVisible();
    await expect(page.getByText(/synthetic data/i).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expectCleanUrl(page);
  });

  test("missing-item links jump to the field on the edit form", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/profile");
    await visible(page.getByTestId("profile-completion")).getByRole("link", { name: "Gender" }).click();
    await expect(page).toHaveURL("/en/patient/health-profile#f-personal-gender");
    await expect(page.getByRole("combobox", { name: "Gender" })).toBeVisible();
  });

  test("invalid values show a focused error summary; a valid save makes the patient ready to book", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/health-profile");
    await page.getByRole("combobox", { name: "Gender" }).selectOption("prefer_not_to_say");
    await page.getByRole("textbox", { name: "Height" }).fill("168");
    await page.getByRole("textbox", { name: "Weight" }).fill("64.55");
    await page.getByRole("radio", { name: "No known conditions" }).check();
    await page.getByRole("radio", { name: "Not taking any medication" }).check();
    await page.getByRole("radio", { name: "No previous surgeries" }).check();
    await page.getByRole("button", { name: "Enter coordinates" }).click();
    await page.getByLabel("Latitude").fill("17.5294");
    await page.getByLabel("Longitude").fill("78.3946");
    await page.getByRole("button", { name: COPY.saveProfile }).click();

    const summary = page.getByRole("alert").filter({ hasText: /fix 1 problem/i });
    await expect(summary).toBeFocused();
    await summary.getByRole("link").click();
    await expect(page.getByRole("textbox", { name: "Weight" })).toBeFocused();

    await page.getByRole("textbox", { name: "Weight" }).fill("64.5");
    await page.getByRole("button", { name: COPY.saveProfile }).click();
    await expect(page).toHaveURL("/en/patient/profile");
    await expect(visible(page.getByTestId("profile-completion"))).toHaveText("Ready to book: 13 of 13 complete");
    await expect(page.getByText("17.5294, 78.3946")).toBeVisible();
    await expectNoPrivateBrowserStorage(page);
    expectCleanUrl(page);
  });

  test("other roles cannot open the patient profile", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto("/en/patient/profile", { waitUntil: "domcontentloaded" });
    // Wrong role: requireRole sends the user to their own landing page.
    await expect(page).toHaveURL(/^[^?]*\/en\/admin\//);
    await expect(page.getByTestId("profile-completion")).toHaveCount(0);
  });

  test("Telugu labels render at 360 px without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signIn(page, ACCOUNTS.patientComplete, "/en/patient/profile");
    await page.goto("/te/patient/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("మీ ప్రొఫైల్ ఒక్క చూపులో");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
