/**
 * FE13 lab e2e (FRONTEND_MASTER s12, s20 "Lab"): multi-test order, assignment, failed
 * collection/recollect, review/release gating, unauthorized collector denied report release.
 * SKELETON: suites are test.describe.fixme until the /[locale]/lab pages exist. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging FEATURE_CLINICAL=true npx playwright test tests/e2e/lab.spec.ts
 */
import { expect, test } from "@playwright/test";
import { labFixtures } from "../../src/fixtures/operations/lab";
import {
  COPY,
  LOCALE,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectNoPrivateDataInUrlOrStorage,
  expectTouchTargets,
  signInAs,
} from "./support/operations";

const L = `/${LOCALE}/lab`;
const ORDER_SCHEDULED = labFixtures.orders.find((o) => o.id === "fx-lab-order-2")!;
const ORDER_FAILED = labFixtures.orders.find((o) => o.id === "fx-lab-order-3")!;

test.describe.configure({ mode: "serial" });

test.describe.fixme("lab manager", () => {
  test("dashboard shows real queue counts, branch status and the synthetic notice", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/dashboard`);
    await expectFixtureNotice(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("metric-pending")).toHaveText(/1/);
    await expect(page.getByTestId("metric-exceptions")).toHaveText(/1/);
    await expect(page.getByText("Synthetic Lab Branch North")).toBeVisible();
    await expectAxeClean(page);
    await expectTouchTargets(page);
  });

  test("orders list and detail show the price snapshot, collector and separate statuses", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/orders`);
    await page.getByRole("link", { name: ORDER_SCHEDULED.reference }).click();
    await expect(page).toHaveURL(new RegExp(`${L}/orders/${ORDER_SCHEDULED.id}$`));
    for (const line of ORDER_SCHEDULED.lines) await expect(page.getByText(line.name)).toBeVisible();
    await expect(page.getByText("₹600.00")).toBeVisible(); // 60000 paise, server total
    await expect(page.getByText("Fixture Collector A")).toBeVisible();
    await expectNoPrivateDataInUrlOrStorage(page);
  });

  test("failed collection offers recollection as a new request and keeps the failed order", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/orders/${ORDER_FAILED.id}`);
    await expect(page.getByText(COPY.collectionFailed)).toBeVisible();
    await page.getByRole("button", { name: COPY.requestRecollection }).click();
    await expect(page.getByRole("status")).toContainText(/#SCV-BKG-\d{6}/);
    await page.reload();
    await expect(page.getByText(COPY.collectionFailed)).toBeVisible();
  });

  test("catalog hides unapproved turnaround claims and edits go through server validation", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/catalog`);
    await expect(page.getByText("Synthetic Test A (blood panel)")).toBeVisible();
    await expect(page.getByText(/24 ?h(ours)?/i)).toHaveCount(0);
  });

  test("a manager of two labs must choose one and never sees combined results", async ({ page }) => {
    await signInAs(page, "multiLabManager", `${L}/orders`);
    await expect(page.getByRole("heading", { name: COPY.chooseWorkspace })).toBeVisible();
    await page.getByRole("button", { name: "Synthetic Lab One" }).click();
    await expect(page.getByText(ORDER_SCHEDULED.reference)).toBeVisible();
    await page.getByRole("button", { name: COPY.switchWorkspace }).click();
    await page.getByRole("menuitem", { name: "Synthetic Lab Nine" }).click();
    await expect(page.getByText(ORDER_SCHEDULED.reference)).toHaveCount(0);
  });
});

test.describe.fixme("lab collector", () => {
  test("sees only assigned jobs and records collection with a reason for failures", async ({ page }) => {
    await signInAs(page, "labCollectorA", `${L}/collections`);
    await expect(page.getByText(ORDER_SCHEDULED.reference)).toBeVisible();
    await expect(page.getByText(ORDER_FAILED.reference)).toHaveCount(0);
    await page.getByRole("button", { name: COPY.collectionFailed }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByText(COPY.reasonRequired)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: COPY.startCollection }).click();
    await expect(page.getByRole("status")).toContainText(/in progress/i);
  });

  test("another collector's order is not found, and reports/orders are denied", async ({ page }) => {
    await signInAs(page, "labCollectorB", `${L}/orders/${ORDER_SCHEDULED.id}`);
    await expectDenied(page);
    await page.goto(`${L}/reports`);
    await expectDenied(page);
  });
});

test.describe.fixme("lab reviewer", () => {
  test("release is offered only for a reviewed report, and never for the uploader's own file", async ({ page }) => {
    await signInAs(page, "labReviewer", `${L}/reports`);
    const reviewedRow = page.getByRole("row", { name: /version 2/i });
    await expect(reviewedRow.getByRole("button", { name: COPY.release })).toBeEnabled();
    const uploadedRow = page.getByRole("row", { name: /version 1/i });
    await expect(uploadedRow.getByRole("button", { name: COPY.release })).toHaveCount(0);
    await reviewedRow.getByRole("button", { name: COPY.release }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(reviewedRow).toContainText(/released/i);
  });

  test("with the clinical gate off the reports page shows the gate notice, not data", async ({ page }) => {
    // Requires a server started without FEATURE_CLINICAL=true.
    await signInAs(page, "labReviewer", `${L}/reports`);
    await expect(page.getByText(COPY.gated)).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.release })).toHaveCount(0);
  });

  test("completed collection copy never claims a report is ready", async ({ page }) => {
    await signInAs(page, "labManager", `${L}/orders`);
    await expect(page.getByText(/report (is )?ready|results available|report delivered/i)).toHaveCount(0);
  });
});
