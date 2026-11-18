/**
 * FE16 admin operations e2e (FRONTEND_MASTER s15/s16, s20 "Payments & support", "Production flags"):
 * capability-based navigation, real dashboard metrics, booking ops search (read-only), admin
 * users/invites (no self-grant), payments vs pay-after, refunds gated, support queue, audit
 * redaction and scope, settings gate display. Provider review and coverage pages belong to fe2-b.
 * SKELETON: test.describe.fixme until the /[locale]/admin pages exist. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/admin-ops.spec.ts
 */
import { expect, test } from "@playwright/test";
import {
  COPY,
  LOCALE,
  PRIVATE_MARKERS,
  expectAxeClean,
  expectDenied,
  expectFixtureNotice,
  expectNoPrivateDataInUrlOrStorage,
  signInAs,
} from "./support/operations";

const AD = `/${LOCALE}/admin`;

test.describe.fixme("admin dashboard and navigation", () => {
  test("lead admin sees only real queue counts and every assigned area", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/dashboard`);
    await expectFixtureNotice(page);
    await expect(page.getByTestId("queue-providerReviews")).toHaveText(/1/);
    for (const name of [/bookings/i, /payments/i, /support/i, /content/i, /audit/i, /settings/i]) {
      await expect(page.getByRole("navigation").getByRole("link", { name })).toBeVisible();
    }
    await expectAxeClean(page);
  });

  test("an admin with no grants gets the empty state and denied pages", async ({ page }) => {
    await signInAs(page, "adminNoGrants", `${AD}/dashboard`);
    await expectDenied(page);
    await page.goto(`${AD}/payments`);
    await expectDenied(page);
  });

  test("an org-scoped auditor sees audit only", async ({ page }) => {
    await signInAs(page, "adminOrgAuditor", `${AD}/dashboard`);
    await expect(page.getByRole("navigation").getByRole("link", { name: /audit/i })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: /payments/i })).toHaveCount(0);
  });
});

test.describe.fixme("booking operations", () => {
  test("search accepts only a booking reference and shows booking and payment as separate badges", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/bookings`);
    await page.getByLabel(COPY.searchReference).fill("Fixture Patient");
    await page.getByRole("button", { name: COPY.search }).click();
    await expect(page.getByText(COPY.invalidReference)).toBeVisible();
    await page.getByLabel(COPY.searchReference).fill("SCV-BKG-900104");
    await page.getByRole("button", { name: COPY.search }).click();
    await expect(page.getByTestId("booking-status")).toContainText(/completed/i);
    await expect(page.getByTestId("payment-status")).toContainText(/due/i);
    await expect(page.getByRole("button", { name: /accept|edit status|mark paid/i })).toHaveCount(0);
    await expectNoPrivateDataInUrlOrStorage(page);
    expect(page.url()).not.toContain("SCV-BKG-900104");
  });
});

test.describe.fixme("users, payments, support, audit, settings", () => {
  test("admins cannot change their own grants", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/users`);
    const self = page.getByRole("row", { name: /Fixture Admin Lead/ });
    await expect(self.getByRole("button", { name: /suspend|edit scope/i })).toHaveCount(0);
    const other = page.getByRole("row", { name: /Fixture Verifier/ });
    await expect(other.getByRole("button", { name: /suspend/i })).toBeVisible();
  });

  test("pay-after collections are never shown as gateway payments and refund approval is gated", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/payments`);
    await expect(page.getByRole("row", { name: /#SCV-BKG-900313/ })).toContainText(/cash/i);
    await expect(page.getByRole("row", { name: /#SCV-BKG-900313/ })).not.toContainText(COPY.gateway);
    await expect(page.getByText(COPY.refundGated)).toBeVisible();
    await expect(page.getByRole("button", { name: /approve refund/i })).toHaveCount(0);
  });

  test("support queue shows owner and status without SLA promises", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/support`);
    await expect(page.getByText("#SCV-SUP-900002")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/24\/7|within \d+ (hours|minutes)/i);
  });

  test("audit list never shows secrets or contact data", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/audit`);
    await expect(page.getByRole("row").first()).toBeVisible();
    const text = await page.locator("main").innerText();
    for (const marker of [...PRIVATE_MARKERS, "eyJhbGci", "Bearer"]) expect(text).not.toContain(marker);
  });

  test("settings display gates read-only", async ({ page }) => {
    await signInAs(page, "adminLead", `${AD}/settings`);
    await expect(page.getByText(/emergency dispatch/i)).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });
});
