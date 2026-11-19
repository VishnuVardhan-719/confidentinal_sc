/**
 * FE15 caretaker e2e (FRONTEND_MASTER s14, s20 "Care"): period/rate, permitted scope, assigned
 * shift, absence/replacement, no clinical privilege for a nonclinical caregiver, recurring gate.
 * Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/caretaker.spec.ts
 */
import { expect, test } from "@playwright/test";
import { caretakerFixtures } from "../../src/fixtures/operations/caretaker";
import {
  COPY,
  LOCALE,
  confirmDialog,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectTouchTargets,
  record,
  shown,
  signInAs,
} from "./support/operations";

const C = `/${LOCALE}/caretaker`;
const ASG_A = caretakerFixtures.assignments.find((a) => a.id === "fx-care-asg-1")!;
const ASG_B = caretakerFixtures.assignments.find((a) => a.id === "fx-care-asg-2")!;
const CLINICAL = /medication|injection|wound|catheter|vital signs|diagnos|prescri/i;

test.describe.configure({ mode: "serial" });

test.describe("agency manager", () => {
  test("services list rates per period and marks periods the backend does not support yet", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/services`);
    await expectFixtureNotice(page);
    await expect(shown(page.getByText("₹300.00 per hour"))).toBeVisible(); // 30000 paise per hour
    await expect(shown(page.locator("li", { hasText: /per week/i }))).toContainText(COPY.notSupportedYet);
    // The page states the non-clinical scope once ("They do not give medicines, injections...");
    // no service, task or action may offer clinical work.
    await expect(shown(page.locator("table, ul[aria-label]"))).not.toContainText(CLINICAL);
    await expect(page.getByRole("button", { name: CLINICAL })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("staff and requests are visible to the manager; replacement only for an absent shift", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/staff`);
    await expect(shown(page.getByText("Fixture Caregiver B"))).toBeVisible();
    await page.goto(`${C}/shifts`);
    // Only the one absent shift offers a replacement.
    const replace = page.getByRole("button", { name: COPY.assignReplacement });
    await expect(replace).toHaveCount(1);
    await replace.click();
    const dialog = page.getByRole("alertdialog");
    const choice = dialog.getByLabel(/replacement caregiver/i);
    // Caregiver C is not verified: the server never offers them as a replacement.
    await expect(choice.locator("option", { hasText: "Fixture Caregiver C" })).toHaveCount(0);
    await expect(choice.locator("option", { hasText: "Fixture Caregiver B" })).toHaveCount(1);
    // Confirming without a choice is refused.
    await confirmDialog(page, /^assign$/i);
    await expect(dialog.getByText(/choose a caregiver/i)).toBeVisible();
  });

  test("recurring plans show the gate notice and no purchase or schedule controls", async ({ page }) => {
    await signInAs(page, "agencyManager", `${C}/plans`);
    await expect(shown(page.getByText(COPY.gated)).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /create plan|subscribe|renew/i })).toHaveCount(0);
  });
});

test.describe("caregiver", () => {
  test("sees only own assignments and checks in with a server timestamp", async ({ page }) => {
    await signInAs(page, "caregiverA", `${C}/assignments`);
    await expect(shown(page.getByText(ASG_A.reference))).toBeVisible();
    await expect(page.getByText(ASG_B.reference)).toHaveCount(0);
    await page.goto(`${C}/shifts`);
    const shift = () => record(page, /Fixture Caregiver A/).filter({ has: page.getByRole("button", { name: /^check (in|out)$/i }) });
    const timeCount = async () => ((await shift().innerText()).match(/\d{1,2}:\d{2}/g) ?? []).length;
    const before = await timeCount();
    await shift().getByRole("button", { name: COPY.checkIn }).click();
    // The server records the check-in: the shift moves on to "Check out" and shows the recorded time.
    await expect(shift().getByRole("button", { name: COPY.checkOut })).toBeVisible();
    await expect(shift()).toContainText(/checked in/i);
    expect(await timeCount()).toBe(before + 1);
    await expectTouchTargets(page);
  });

  test("no clinical actions are offered and agency staff/services are denied", async ({ page }) => {
    await signInAs(page, "caregiverA", `${C}/assignments/${ASG_A.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: CLINICAL })).toHaveCount(0);
    for (const route of ["staff", "services", "requests"]) {
      await page.goto(`${C}/${route}`);
      await expectDenied(page);
    }
  });

  test("another caregiver's assignment is not found", async ({ page }) => {
    await signInAs(page, "caregiverB", `${C}/assignments/${ASG_A.id}`);
    await expect(page.getByText(COPY.notFound)).toBeVisible();
    await expect(page.getByText(ASG_A.reference)).toHaveCount(0);
  });
});

test.describe("independent caregiver", () => {
  test("manages own services but has no staff page", async ({ page }) => {
    await signInAs(page, "independentCaregiver", `${C}/services`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(`${C}/staff`);
    await expectDenied(page);
  });
});
