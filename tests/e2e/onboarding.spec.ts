import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, COPY, expectNoPrivateBrowserStorage, signIn, visible } from "./support/identity";

/**
 * FE05 onboarding wizards per role (FRONTEND_MASTER s8) against SYNTHETIC fixtures.
 * Dev-server fixture drafts are shared process memory: suites run serially on a fresh server.
 * Checks that need role pages owned by other workstreams (dashboards, /patient/bookings,
 * /lab/orders) are `test.fixme` until those routes exist on this branch (REQUESTS R-FE07-04).
 */

test.describe.configure({ mode: "serial" });

const goto = (page: Page, path: string) => page.goto(path, { waitUntil: "domcontentloaded" });
const h1 = (page: Page) => visible(page.getByRole("heading", { level: 1 }));

test.describe("patient questionnaire", () => {
  test("resumes at the first missing section and shows step position", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await expect(page).toHaveURL("/en/patient/onboarding");
    await expect(h1(page)).not.toBeEmpty();
    await expect(visible(page.getByText(/step \d+ of 11/i))).toBeVisible();
    await expect(visible(page.getByRole("navigation", { name: "Steps" }))).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  // Integration (fe-int2 INT5): un-fixme'd; the fe-c booking page is /patient/book (there is no /patient/bookings/new).
  test("ordinary booking is blocked until the questionnaire is complete (booking page is fe-c)", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await goto(page, "/en/patient/book");
    await expect(page).toHaveURL("/en/patient/onboarding");
  });

  test("Unknown answers save and advance; None hides details; reload resumes server state", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/onboarding?step=medicines");
    await expect(h1(page)).toHaveText(/current medicines/i);
    await visible(page.getByRole("radio", { name: COPY.unknown })).check();
    await visible(page.getByRole("button", { name: COPY.saveContinue })).click();
    await expect(page).toHaveURL("/en/patient/onboarding?step=surgeries");

    await visible(page.getByRole("radio", { name: COPY.listed })).check();
    await expect(visible(page.getByRole("textbox", { name: /procedure/i }))).toBeVisible();
    await visible(page.getByRole("radio", { name: COPY.none })).check();
    await expect(page.getByRole("textbox", { name: /procedure/i }).filter({ visible: true })).toHaveCount(0);
    await visible(page.getByRole("button", { name: COPY.saveContinue })).click();
    await expect(page).toHaveURL(/step=medicalHistory/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/step=medicalHistory/);
    await goto(page, "/en/patient/onboarding?step=medicines");
    await expect(visible(page.getByRole("radio", { name: COPY.unknown }))).toBeChecked();
    await expectNoPrivateBrowserStorage(page);
  });

  test("Listed without details shows a focused error summary that links to the field", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/onboarding?step=medicalHistory");
    await visible(page.getByRole("radio", { name: COPY.listed })).check();
    await visible(page.getByRole("button", { name: COPY.saveContinue })).click();
    const summary = visible(page.getByRole("alert").filter({ hasText: /problem/i }));
    await expect(summary).toBeFocused();
    await summary.getByRole("link").first().click();
    await expect(visible(page.getByRole("textbox", { name: /condition/i }))).toBeFocused();
  });

  test("blood group offers Unknown but not None; documents offer 'No documents available'", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/onboarding?step=bloodGroup");
    await expect(visible(page.getByRole("radio", { name: COPY.unknown }))).toBeVisible();
    await expect(page.getByRole("radio", { name: COPY.none }).filter({ visible: true })).toHaveCount(0);
    await goto(page, "/en/patient/onboarding?step=documents");
    await expect(visible(page.getByRole("radio", { name: /no documents available/i }))).toBeVisible();
  });

  test("review lists missing sections and requires consent before submit", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/patient/onboarding?step=review");
    await expect(visible(page.getByRole("list", { name: /still needed/i }))).toBeVisible();
    await expect(visible(page.getByRole("button", { name: /submit questionnaire/i }))).toBeDisabled();
  });

  test("a completed patient is sent to the dashboard after sign-in", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await expect(page).toHaveURL("/en/patient/dashboard");
  });
});

test.describe("doctor onboarding", () => {
  test("draft doctor sees status, required steps and missing requirements, not a percentage", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft, "/en/doctor/onboarding");
    await expect(page).toHaveURL(/\/en\/doctor\/onboarding/);
    await expect(visible(page.getByText(/^draft$/i))).toBeVisible();
    const missing = visible(page.getByRole("list", { name: /still needed/i }));
    for (const step of [/registration/i, /fees/i, /working hours/i, /documents/i]) {
      await expect(missing.getByText(step)).toBeVisible();
    }
    await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("fee is entered in rupees and validated; starting point is labelled private", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft, "/en/doctor/onboarding?step=practice");
    await visible(page.getByLabel(/home visit fee/i)).fill("800.555");
    await visible(page.getByRole("button", { name: COPY.saveContinue })).click();
    await expect(visible(page.getByRole("alert"))).toBeVisible();
    await expect(visible(page.getByText(/never shown to patients/i))).toBeVisible();
  });

  test("submit is disabled until required steps are complete", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorDraft, "/en/doctor/onboarding?step=review");
    await expect(visible(page.getByRole("button", { name: COPY.submitReview }))).toBeDisabled();
    await expect(visible(page.getByText(/private: not shown to patients/i))).toBeVisible();
  });

  test("an active doctor is sent to the dashboard after sign-in", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorActive);
    await expect(page).toHaveURL("/en/doctor/dashboard");
  });
});

test.describe("lab onboarding", () => {
  test("pending review: onboarding shows status and no editor", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner, "/en/lab/onboarding");
    await expect(page).toHaveURL("/en/lab/onboarding");
    await expect(visible(page.getByText(/under review/i))).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.saveContinue })).toHaveCount(0);
  });

  // Integration (fe-int2 INT5): un-fixme'd; /lab/dashboard and /lab/orders exist here.
  test("pending review: setup dashboard and operational pages redirect (lab pages are fe-e)", async ({ page }) => {
    await signIn(page, ACCOUNTS.labOwner);
    await expect(page).toHaveURL("/en/lab/dashboard");
    await goto(page, "/en/lab/orders");
    await expect(page).toHaveURL("/en/lab/dashboard");
  });
});

test.describe("ambulance onboarding", () => {
  test("changes requested: resumes at vehicles, scheduled transport only", async ({ page }) => {
    await signIn(page, ACCOUNTS.ambulance);
    await expect(page).toHaveURL("/en/ambulance/onboarding");
    await expect(visible(page.getByText(/changes requested/i))).toBeVisible();
    await expect(h1(page)).toContainText(/vehicles/i);
    await goto(page, "/en/ambulance/onboarding?step=operator");
    await expect(visible(page.getByText(/scheduled patient transport only/i))).toBeVisible();
    await expect(page.getByRole("radio", { name: /emergency/i })).toHaveCount(0);
  });
});

test.describe("caretaker onboarding", () => {
  test("a suspended caregiver cannot open the onboarding editor", async ({ page }) => {
    await signIn(page, ACCOUNTS.caregiverSuspended);
    await expect(page).toHaveURL("/en/caretaker/dashboard");
    await goto(page, "/en/caretaker/onboarding");
    await expect(page).toHaveURL("/en/caretaker/dashboard");
  });

  test("a signed-in user can start a caregiver application; clinical tasks need a nursing credential", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete, "/en/caretaker/onboarding");
    await visible(page.getByLabel(/name shown to patients/i)).fill("Synthetic Caregiver Applicant");
    await visible(page.getByRole("button", { name: /start application/i })).click();
    await expect(page).toHaveURL(/\/en\/caretaker\/onboarding\?provider=[0-9a-f-]{36}/);
    await goto(page, `${page.url()}&step=skills`);
    await visible(page.getByRole("checkbox", { name: /wound dressing/i })).check();
    await visible(page.getByRole("button", { name: COPY.saveContinue })).click();
    await expect(visible(page.getByRole("alert"))).toContainText(/nursing/i);
  });
});
