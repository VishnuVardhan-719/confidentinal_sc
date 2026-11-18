/**
 * FE15 caretaker e2e (FRONTEND_MASTER s14, s20 "Care"): period/rate, permitted scope, assigned
 * shift, absence/replacement, no clinical privilege for a nonclinical caregiver, recurring gate.
 * SKELETON: test.describe.fixme until the /[locale]/caretaker pages exist. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/caretaker.spec.ts
 */
import { expect, test } from "@playwright/test";
import { caretakerFixtures } from "../../src/fixtures/operations/caretaker";
import {
  COPY,
  LOCALE,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectTouchTargets,
  signInAs,
} from "./support/operations";

const C = `/${LOCALE}/caretaker`;
const ASG_A = caretakerFixtures.assignments.find((a) => a.id === "fx-care-asg-1")!;
const ASG_B = caretakerFixtures.assignments.find((a) => a.id === "fx-care-asg-2")!;
const CLINICAL = /medication|injection|wound|catheter|vital signs|diagnos|prescri/i;

test.describe.configure({ mode: "serial" });

test.describe.fixme("agency manager", () => {
  test("services list rates per period and marks periods the backend does not support yet", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/services`);
    await expectFixtureNotice(page);
    await expect(page.getByText("₹300.00")).toBeVisible(); // 30000 paise per hour
    await expect(page.getByRole("row", { name: /week/i })).toContainText(COPY.notSupportedYet);
    await expect(page.locator("main")).not.toContainText(CLINICAL);
    await expectAxeClean(page);
  });

  test("staff and requests are visible to the manager; replacement only for an absent shift", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/staff`);
    await expect(page.getByText("Fixture Caregiver B")).toBeVisible();
    await page.goto(`${C}/shifts`);
    await page.getByRole("button", { name: COPY.assignReplacement }).first().click();
    await page.getByRole("option", { name: "Fixture Caregiver C" }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByRole("alert")).toContainText(/not eligible/i);
  });

  test("recurring plans show the gate notice and no purchase or schedule controls", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/plans`);
    await expect(page.getByText(COPY.gated)).toBeVisible();
    await expect(page.getByRole("button", { name: /create plan|subscribe|renew/i })).toHaveCount(0);
  });
});

test.describe.fixme("caregiver", () => {
  test("sees only own assignments and checks in with a server timestamp", async ({ page }) => {
    await signInAs(page, "caregiverA", `${C}/assignments`);
    await expect(page.getByText(ASG_A.reference)).toBeVisible();
    await expect(page.getByText(ASG_B.reference)).toHaveCount(0);
    await page.goto(`${C}/shifts`);
    await page.getByRole("button", { name: COPY.checkIn }).first().click();
    await expect(page.getByRole("status")).toContainText(/checked in/i);
    await expectTouchTargets(page);
  });

  test("no clinical actions are offered and agency staff/services are denied", async ({ page }) => {
    await signInAs(page, "caregiverA", `${C}/assignments/${ASG_A.id}`);
    await expect(page.getByRole("button", { name: CLINICAL })).toHaveCount(0);
    for (const route of ["staff", "services", "requests"]) {
      await page.goto(`${C}/${route}`);
      await expectDenied(page);
    }
  });

  test("another caregiver's assignment is not found", async ({ page }) => {
    await signInAs(page, "caregiverB", `${C}/assignments/${ASG_A.id}`);
    await expect(page.getByText(COPY.notFound)).toBeVisible();
  });
});

test.describe.fixme("independent caregiver", () => {
  test("manages own services but has no staff page", async ({ page }) => {
    await signInAs(page, "independentCaregiver", `${C}/services`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(`${C}/staff`);
    await expectDenied(page);
  });
});
