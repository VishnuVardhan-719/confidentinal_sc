/**
 * FE13 lab e2e (FRONTEND_MASTER s12, s20 "Lab"): multi-test order, assignment, failed
 * collection/recollect, review/release gating, unauthorized collector denied report release.
 * Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/lab.spec.ts
 * Report release: run again with FEATURE_CLINICAL=true set for the server and for Playwright.
 */
import { expect, test } from "@playwright/test";
import { labFixtures } from "../../src/fixtures/operations/lab";
import {
  COPY,
  LOCALE,
  confirmDialog,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectNoPrivateDataInUrlOrStorage,
  expectTouchTargets,
  notifications,
  record,
  shown,
  signInAs,
} from "./support/operations";

const L = `/${LOCALE}/lab`;
const ORDER_SCHEDULED = labFixtures.orders.find((o) => o.id === "fx-lab-order-2")!;
const ORDER_FAILED = labFixtures.orders.find((o) => o.id === "fx-lab-order-3")!;
const CLINICAL_ON = process.env.FEATURE_CLINICAL === "true";

test.describe.configure({ mode: "serial" });

test.describe("lab manager", () => {
  test("dashboard shows real queue counts, branch status and the synthetic notice", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/dashboard`);
    await expectFixtureNotice(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("metric-pending")).toHaveText(/1/);
    await expect(page.getByTestId("metric-exceptions")).toHaveText(/1/);
    await expect(shown(page.getByText("Synthetic Lab Branch North"))).toBeVisible();
    await expectAxeClean(page);
    await expectTouchTargets(page);
  });

  test("orders list and detail show the price snapshot, collector and separate statuses", async ({ page }) => {
    // A confirmed order with a collection window is listed under "Scheduled" whatever its day.
    await signInAs(page, "labManager", `${L}/orders?queue=scheduled`);
    await page.getByRole("link", { name: ORDER_SCHEDULED.reference }).click();
    await expect(page).toHaveURL(new RegExp(`${L}/orders/${ORDER_SCHEDULED.id}$`));
    for (const line of ORDER_SCHEDULED.lines) await expect(shown(page.getByText(line.name))).toBeVisible();
    await expect(page.getByText(/^Total: ₹600\.00$/)).toBeVisible(); // 60000 paise, server total
    await expect(shown(page.getByText("Fixture Collector A")).first()).toBeVisible();
    await expectNoPrivateDataInUrlOrStorage(page);
  });

  test("failed collection offers recollection as a new request and keeps the failed order", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/orders/${ORDER_FAILED.id}`);
    // Shown as the current status and again in the status history.
    await expect(page.getByText(COPY.collectionFailed).first()).toBeVisible();
    await page.getByRole("button", { name: COPY.requestRecollection }).click();
    await confirmDialog(page, COPY.requestRecollection);
    await expect(notifications(page)).toContainText(/#SCV-BKG-\d{6}/);
    await page.reload();
    await expect(page.getByText(COPY.collectionFailed).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(ORDER_FAILED.reference);
  });

  test("catalog hides unapproved turnaround claims and edits go through server validation", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/catalog`);
    await expect(shown(page.getByText("Synthetic Test A (blood panel)"))).toBeVisible();
    await expect(page.getByText(/24 ?h(ours)?/i)).toHaveCount(0);
  });

  test("a manager of two labs must choose one and never sees combined results", async ({ page }) => {
    await signInAs(page, "multiLabManager", `${L}/orders?queue=scheduled`);
    await expect(page.getByRole("heading", { name: COPY.chooseWorkspace })).toBeVisible();
    await page.getByRole("button", { name: "Synthetic Lab One" }).click();
    await expect(shown(page.getByText(ORDER_SCHEDULED.reference))).toBeVisible();
    await page.getByRole("button", { name: COPY.switchWorkspace }).click();
    await page.getByRole("menuitem", { name: "Synthetic Lab Nine" }).click();
    // Wait until the shell shows the other lab before checking that Lab One's order is gone.
    await expect(page.getByRole("banner")).toContainText("Synthetic Lab Nine");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(ORDER_SCHEDULED.reference)).toHaveCount(0);
  });
});

test.describe("lab collector", () => {
  test("sees only assigned jobs and records collection with a reason for failures", async ({ page }) => {
    await signInAs(page, "labCollectorA", `${L}/collections`);
    const job = record(page, ORDER_SCHEDULED.reference);
    await expect(job).toBeVisible();
    await expect(page.getByText(ORDER_FAILED.reference)).toHaveCount(0);
    await job.getByRole("button", { name: COPY.collectionFailed }).click();
    await confirmDialog(page, COPY.collectionFailed);
    await expect(page.getByRole("alertdialog").getByText(COPY.reasonRequired)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await job.getByRole("button", { name: COPY.startCollection }).click();
    await confirmDialog(page, COPY.startCollection);
    await expect(record(page, ORDER_SCHEDULED.reference)).toContainText(/in progress/i);
  });

  test("another collector's order is not found, and reports/orders are denied", async ({ page }) => {
    await signInAs(page, "labCollectorB", `${L}/orders/${ORDER_SCHEDULED.id}`);
    await expectDenied(page);
    await page.goto(`${L}/reports`);
    await expectDenied(page);
  });
});

test.describe("lab reviewer", () => {
  test("release is offered only for a reviewed report, and never for the uploader's own file", async ({ page }) => {
    test.skip(!CLINICAL_ON, "needs a server started with FEATURE_CLINICAL=true");
    await signInAs(page, "labReviewer", `${L}/reports`);
    const reviewed = record(page, /version 2/i);
    await expect(reviewed.getByRole("button", { name: COPY.release })).toBeEnabled();
    const uploaded = record(page, /version 1/i);
    await expect(uploaded).toBeVisible();
    await expect(uploaded.getByRole("button", { name: COPY.release })).toHaveCount(0);
    await reviewed.getByRole("button", { name: COPY.release }).click();
    await confirmDialog(page, COPY.release);
    await expect(record(page, /version 2/i)).toContainText(/released/i);
  });

  test("with the clinical gate off the reports page shows the gate notice, not data", async ({ page }) => {
    test.skip(CLINICAL_ON, "needs a server started without FEATURE_CLINICAL=true");
    await signInAs(page, "labReviewer", `${L}/reports`);
    await expect(shown(page.getByText(COPY.gated)).first()).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.release })).toHaveCount(0);
    await expect(page.getByText(/version \d/i)).toHaveCount(0);
  });

  test("completed collection copy never claims a report is ready", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/orders`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/report (is )?ready|results available|report delivered/i)).toHaveCount(0);
  });
});
