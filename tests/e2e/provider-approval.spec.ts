import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, COPY, signIn, signOut, visible } from "./support/identity";

/**
 * Provider approval gate on SYNTHETIC data: a doctor, lab, ambulance or caretaker whose application is with
 * the admin sees only "your request has been sent to the admin" until an admin approves it. Patients and
 * already-approved providers are unaffected. The admin decision mutates shared fixture memory, so the
 * suite runs serially and the approval is the last test.
 */
const LAB = "00000000-0000-4000-8000-000000003001";
const PENDING_URL = /\/en\/workspace\/pending\?role=lab$/;
const heading = (page: Page) => visible(page.getByRole("heading", { level: 1 }));

test.describe.configure({ mode: "serial" });

test.describe("waiting for the admin", () => {
  test("sign-in shows the request-sent message and no dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    await expect(page).toHaveURL(PENDING_URL);
    await expect(heading(page)).toHaveText(/your request has been sent to the admin/i);
    await expect(page.getByText(/only after the admin accepts your request/i)).toBeVisible();
    // No way into the workspace from here: nothing links to a lab page.
    await expect(page.locator('a[href*="/lab/"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: COPY.signOut }).first()).toBeVisible();
  });

  test("dashboard and workspace pages cannot be opened by URL", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    for (const path of ["/en/lab/dashboard", "/en/lab/orders", "/en/lab/onboarding", "/en/lab/billing", "/en/lab/staff", "/en/lab/reports"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page, path).toHaveURL(PENDING_URL);
      await expect(heading(page)).toHaveText(/request has been sent to the admin/i);
    }
  });

  test("the message page passes axe", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    await expect(heading(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the message is translated", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    await page.goto("/hi/workspace/pending?role=lab", { waitUntil: "domcontentloaded" });
    await expect(heading(page)).toHaveText(/एडमिन को भेज दिया गया है/);
  });
});

test.describe("everyone else is unaffected", () => {
  test("an approved doctor still opens the dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorActive);
    await expect(page).toHaveURL("/en/doctor/dashboard");
  });

  test("patients keep their own flow and never see the message", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await expect(page).toHaveURL("/en/patient/dashboard");
    await page.goto("/en/account/security", { waitUntil: "domcontentloaded" });
    await signOut(page);
    await signIn(page, ACCOUNTS.patientNew);
    await expect(page).toHaveURL("/en/patient/onboarding");
    // A patient who opens the page directly is sent back to their own home.
    await page.goto("/en/workspace/pending", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/en\/patient\/onboarding$/);
  });
});

test.describe("admin approval", () => {
  test("after the admin accepts the request, signing in opens the dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto(`/en/admin/providers/${LAB}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: COPY.approve }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(COPY.reason).fill("Synthetic licence evidence checked");
    await dialog.getByLabel(COPY.confirmCheckbox).check();
    await dialog.getByRole("button", { name: COPY.confirm }).click();
    await expect(visible(page.getByText(/^active$/i))).toBeVisible();
    await signOut(page);

    await signIn(page, ACCOUNTS.labOwner);
    await expect(page).toHaveURL("/en/lab/dashboard");
    await page.goto("/en/workspace/pending?role=lab", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/en/lab/dashboard");
  });
});
