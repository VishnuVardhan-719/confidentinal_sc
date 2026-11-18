import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, COPY, expectNoPrivateBrowserStorage, signIn } from "./support/identity";

/**
 * FE05 onboarding wizards per role (FRONTEND_MASTER s8) against SYNTHETIC fixtures.
 * Dev-server fixture drafts are shared process memory: suites run serially.
 * test.describe.fixme until the wizard pages exist.
 */

test.describe.configure({ mode: "serial" });

test.describe.fixme("patient questionnaire", () => {
  test("resumes at the first missing section and shows step position", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await expect(page).toHaveURL("/en/patient/onboarding");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/current medicines/i);
    await expect(page.getByText(/step 5 of 10/i)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("ordinary booking is blocked until the questionnaire is complete", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await page.goto("/en/patient/bookings/new");
    await expect(page).toHaveURL("/en/patient/onboarding");
  });

  test("Unknown answers save and advance; None hides details; reload resumes server state", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await page.getByRole("radio", { name: COPY.unknown }).check();
    await page.getByRole("button", { name: COPY.saveContinue }).click();
    await expect(page).toHaveURL("/en/patient/onboarding?step=surgeries");

    await page.getByRole("radio", { name: COPY.listed }).check();
    await expect(page.getByRole("textbox", { name: /procedure/i }).first()).toBeVisible();
    await page.getByRole("radio", { name: COPY.none }).check();
    await expect(page.getByRole("textbox", { name: /procedure/i })).toHaveCount(0);
    await page.getByRole("button", { name: COPY.saveContinue }).click();

    await page.reload();
    await expect(page).toHaveURL(/step=medicalHistory/);
    await page.goto("/en/patient/onboarding?step=medicines");
    await expect(page.getByRole("radio", { name: COPY.unknown })).toBeChecked();
    await expectNoPrivateBrowserStorage(page);
  });

  test("Listed without details shows a field error and focuses it", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await page.goto("/en/patient/onboarding?step=medicalHistory");
    await page.getByRole("radio", { name: COPY.listed }).check();
    await page.getByRole("button", { name: COPY.saveContinue }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /condition/i }).first()).toBeFocused();
  });

  test("blood group offers Unknown but not None; documents upload is optional", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await page.goto("/en/patient/onboarding?step=bloodGroup");
    await expect(page.getByRole("radio", { name: COPY.unknown })).toBeVisible();
    await expect(page.getByRole("radio", { name: COPY.none })).toHaveCount(0);
    await page.goto("/en/patient/onboarding?step=documents");
    await expect(page.getByRole("radio", { name: /no documents available/i })).toBeVisible();
  });

  test("review lists missing sections and requires consent before submit", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await page.goto("/en/patient/onboarding?step=review");
    await expect(page.getByRole("list", { name: /still needed/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  test("a completed patient goes straight to the dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await expect(page).toHaveURL("/en/patient/dashboard");
  });
});

test.describe.fixme("doctor onboarding", () => {
  test("draft doctor sees status, required steps and missing requirements, not a percentage", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft, "/en/doctor/onboarding");
    await expect(page.getByText(/^draft$/i)).toBeVisible();
    const missing = page.getByRole("list", { name: /still needed/i });
    for (const step of [/registration|identity/i, /practice/i, /availability/i, /documents/i]) {
      await expect(missing.getByText(step)).toBeVisible();
    }
    await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
  });

  test("fee is entered in rupees and validated; private starting point is labelled private", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft);
    await page.goto("/en/doctor/onboarding?step=practice");
    await page.getByLabel(/home visit fee/i).fill("800.555");
    await page.getByRole("button", { name: COPY.saveContinue }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/not shown to patients/i)).toBeVisible();
  });

  test("submit is disabled until required steps are complete", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft);
    await page.goto("/en/doctor/onboarding?step=review");
    await expect(page.getByRole("button", { name: COPY.submitReview })).toBeDisabled();
  });

  test("an active doctor is not sent to onboarding", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorActive);
    await expect(page).toHaveURL("/en/doctor/dashboard");
  });
});

test.describe.fixme("lab onboarding", () => {
  test("pending review shows restricted setup dashboard; operational pages redirect", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    await expect(page).toHaveURL("/en/lab/dashboard");
    await expect(page.getByText(/under review/i)).toBeVisible();
    await page.goto("/en/lab/orders");
    await expect(page).toHaveURL("/en/lab/dashboard");
    await page.goto("/en/lab/onboarding");
    await expect(page.getByRole("button", { name: COPY.saveContinue })).toHaveCount(0);
  });
});

test.describe.fixme("ambulance onboarding", () => {
  test("changes required: resumes at fleet, scheduled transport only", async ({ page }) => {
    await signIn(page, ACCOUNTS.ambulance);
    await expect(page).toHaveURL("/en/ambulance/onboarding");
    await expect(page.getByText(/changes required/i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/fleet/i);
    await page.goto("/en/ambulance/onboarding?step=operator");
    await expect(page.getByText(/scheduled transport only/i)).toBeVisible();
    await expect(page.getByRole("radio", { name: /emergency/i })).toHaveCount(0);
  });
});

test.describe.fixme("caretaker onboarding", () => {
  test("suspended caregiver sees status and support, not the editor", async ({ page }) => {
    await signIn(page, ACCOUNTS.caregiverSuspended);
    await expect(page).toHaveURL("/en/caretaker/dashboard");
    await expect(page.getByText(/suspended/i)).toBeVisible();
    await page.goto("/en/caretaker/onboarding");
    await expect(page).toHaveURL("/en/caretaker/dashboard");
  });

  test("a signed-in user can start a caregiver application; clinical tasks need a nursing credential", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await page.goto("/en/caretaker/onboarding");
    await page.getByLabel(/display name/i).fill("Synthetic Caregiver Applicant");
    await page.getByRole("button", { name: /start application/i }).click();
    await expect(page).toHaveURL(/\/en\/caretaker\/onboarding\?provider=[0-9a-f-]{36}/);
    await page.goto(`${page.url()}&step=skills`);
    await page.getByRole("checkbox", { name: /wound dressing/i }).check();
    await page.getByRole("button", { name: COPY.saveContinue }).click();
    await expect(page.getByRole("alert")).toContainText(/nursing/i);
  });
});
