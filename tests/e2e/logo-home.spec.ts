import { expect, test as guestTest } from "@playwright/test";
import { patientTest } from "./support/fixture-session";

/** The logo is the way "home": the dashboard for someone signed in, the landing page for everyone else. */

patientTest.describe("signed in", () => {
  patientTest.beforeEach(async ({ page }) => {
    // The first-visit location question is not what this spec is about.
    await page.addInitScript(() => localStorage.setItem("scv.location.v1", JSON.stringify({ v: 1, skipped: true })));
  });

  patientTest("the public header logo opens the dashboard", async ({ page }) => {
    await page.goto("/en/faq");
    const logo = page.getByRole("banner").getByRole("link", { name: /SureCure Visit/i }).first();
    await expect(logo).toHaveAttribute("href", /\/en\/patient\/dashboard$/);
    await logo.click();
    await expect(page).toHaveURL(/\/en\/patient\/dashboard$/);
  });

  patientTest("the in-app logo opens the dashboard from a deeper page", async ({ page, isMobile }) => {
    // Phones have no sidebar: the bottom bar leads home there.
    patientTest.skip(isMobile, "the logo lives in the desktop sidebar");
    await page.goto("/en/patient/bookings");
    const logo = page.getByRole("link", { name: /SureCure Visit/i }).filter({ visible: true }).first();
    await expect(logo).toHaveAttribute("href", /\/en\/patient\/dashboard$/);
    await logo.click();
    await expect(page).toHaveURL(/\/en\/patient\/dashboard$/);
  });
});

guestTest("signed out, the logo still opens the landing page", async ({ page }) => {
  await page.goto("/en/faq");
  const logo = page.getByRole("banner").getByRole("link", { name: /SureCure Visit/i }).first();
  await expect(logo).toHaveAttribute("href", /\/en$/);
});
