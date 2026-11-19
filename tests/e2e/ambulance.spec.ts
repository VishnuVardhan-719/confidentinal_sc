/**
 * FE14 ambulance e2e (FRONTEND_MASTER s13, s20 "Ambulance"): scheduled pickup/destination,
 * verified fleet/crew, accept with capacity + stale quote, trip states, driver sees only the
 * assigned trip, no emergency booking while dispatch is disabled, 112 always visible, no ETA.
 * SKELETON: test.describe.fixme until the /[locale]/ambulance pages exist. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/ambulance.spec.ts
 */
import { expect, test } from "@playwright/test";
import { ambulanceFixtures } from "../../src/fixtures/operations/ambulance";
import {
  COPY,
  ETA_PATTERN,
  LOCALE,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectNoPrivateDataInUrlOrStorage,
  signInAs,
} from "./support/operations";

const A = `/${LOCALE}/ambulance`;
const [STALE_REQUEST, FRESH_REQUEST] = ambulanceFixtures.requests;
const DRIVER_A_TRIP = ambulanceFixtures.trips.find((t) => t.id === "fx-trip-1")!;
const DRIVER_B_TRIP = ambulanceFixtures.trips.find((t) => t.id === "fx-trip-2")!;

test.describe.configure({ mode: "serial" });

test.describe("ambulance operator", () => {
  test("dashboard shows real counts, credential expiry and no ETA language", async ({ page }) => {
    await signInAs(page, "ambulanceOperator", `${A}/dashboard`);
    await expectFixtureNotice(page);
    await expect(page.getByTestId("metric-pending-requests")).toHaveText(/2/);
    await expect(page.getByText("Fixture Van 2")).toBeVisible(); // expiring evidence warning
    await expect(page.locator("main")).not.toContainText(ETA_PATTERN);
    await expectAxeClean(page);
  });

  test("fleet shows a vehicle type only when verified", async ({ page }) => {
    await signInAs(page, "ambulanceOperator", `${A}/fleet`);
    await expect(page.getByRole("row", { name: /Fixture Van 3/ })).toContainText(COPY.notVerified);
    await expect(page.getByRole("row", { name: /Fixture Van 1/ })).toContainText(/stretcher/i);
  });

  test("accept is blocked for a stale quote and allowed for a fresh one; decline always needs a reason", async ({ page }) => {
    await signInAs(page, "ambulanceOperator", `${A}/requests`);
    const stale = page.getByRole("row", { name: new RegExp(STALE_REQUEST.reference) });
    await expect(stale.getByRole("button", { name: COPY.accept })).toBeDisabled();
    await expect(stale).toContainText(COPY.staleQuote);
    const fresh = page.getByRole("row", { name: new RegExp(FRESH_REQUEST.reference) });
    await expect(fresh.getByRole("button", { name: COPY.accept })).toBeEnabled();
    await expect(fresh).toContainText("₹1,340.00"); // server quote breakdown total
    await fresh.getByRole("button", { name: COPY.decline }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByText(COPY.reasonRequired)).toBeVisible();
  });

  test("operator cannot record driver milestones", async ({ page }) => {
    await signInAs(page, "ambulanceOperator", `${A}/trips/${DRIVER_A_TRIP.id}`);
    await expect(page.getByRole("button", { name: COPY.setOff })).toHaveCount(0);
  });
});

test.describe("ambulance driver", () => {
  test("sees only the assigned current trip and one next step", async ({ page }) => {
    await signInAs(page, "driverA", `${A}/driver`);
    await expect(page.getByText(DRIVER_A_TRIP.reference)).toBeVisible();
    await expect(page.getByText(DRIVER_B_TRIP.reference)).toHaveCount(0);
    await expect(page.getByRole("button", { name: COPY.setOff })).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.arrived })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(ETA_PATTERN);
    await expectNoPrivateDataInUrlOrStorage(page);
  });

  test("another driver's trip and the fleet page are denied", async ({ page }) => {
    await signInAs(page, "driverA", `${A}/trips/${DRIVER_B_TRIP.id}`);
    await expectDenied(page);
    await page.goto(`${A}/fleet`);
    await expectDenied(page);
  });
});

test.describe("emergency dispatch placeholder", () => {
  test("dispatch is unavailable and Call 112 is always visible as a tel: link", async ({ page }) => {
    await signInAs(page, "ambulanceOperator", `${A}/emergency`);
    await expect(page.getByText(COPY.dispatchUnavailable)).toBeVisible();
    // The top bar also carries a Call 112 link; check the one in the page body.
    const call = page.getByRole("main").getByRole("link", { name: COPY.call112 }).last();
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:112");
    await expect(page.getByRole("button", { name: /dispatch|request ambulance now|book emergency/i })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(ETA_PATTERN);
  });

  test("Call 112 stays visible with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    // Signed out and without JS: the public /emergency page must still offer 112.
    await page.goto(`/${LOCALE}/emergency`);
    await expect(page.getByRole("link", { name: COPY.call112 })).toHaveAttribute("href", "tel:112");
    await context.close();
  });

  test("stays unavailable even if the dispatch flag is switched on", async ({ page }) => {
    // Requires a server started with FEATURE_EMERGENCY_DISPATCH=true FEATURE_GPS=true (S01 A2).
    await signInAs(page, "ambulanceOperator", `${A}/emergency`);
    await expect(page.getByText(COPY.dispatchUnavailable)).toBeVisible();
    await expect(page.getByRole("link", { name: COPY.call112 }).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(ETA_PATTERN);
  });
});
