import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, COPY, signIn, visible } from "./support/identity";

/**
 * FE06 admin provider verification + coverage (FRONTEND_MASTER s15) on SYNTHETIC data.
 * Decisions mutate shared dev-server fixture memory, so the suite runs serially and in order.
 * test.describe.fixme until /admin/providers and /admin/coverage exist.
 */

const LAB = "00000000-0000-4000-8000-000000003001";
const DOCTOR_SUBMITTED = "00000000-0000-4000-8000-000000002003";

test.describe.configure({ mode: "serial" });

test.describe("review queue", () => {
  test("lists only items needing action, oldest first, and passes axe", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier, "/en/admin/providers");
    const rows = page.getByRole("row");
    await expect(rows.filter({ hasText: /synthetic diagnostics/i })).toHaveCount(1);
    await expect(rows.filter({ hasText: /synthetic doctor j/i })).toHaveCount(1);
    await expect(rows.filter({ hasText: /synthetic caregiver g/i })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("filters live in the URL and invalid values are ignored", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto("/en/admin/providers", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/category/i).selectOption("lab");
    await expect(page).toHaveURL(/category=lab/);
    await expect(page.getByRole("row").filter({ hasText: /synthetic doctor j/i })).toHaveCount(0);
    await page.goto("/en/admin/providers?category=admin&status=ACTIVE", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("row").filter({ hasText: /synthetic doctor j/i })).toHaveCount(1);
  });

  test("empty filter result shows an empty state, not an error", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto("/en/admin/providers?category=ambulance&status=submitted", { waitUntil: "domcontentloaded" });
    await expect(visible(page.getByText(/no applications/i))).toBeVisible();
  });
});

test.describe("review detail and decisions", () => {
  test("shows credential metadata; private document viewer is gated (no URL issued)", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto(`/en/admin/providers/${LAB}`, { waitUntil: "domcontentloaded" });
    await expect(visible(page.getByText(/licence/i))).toBeVisible();
    await page.getByRole("button", { name: /view document/i }).click();
    await expect(page.getByText(COPY.documentViewerGated)).toBeVisible();
    await expect(page.locator("iframe, embed, object")).toHaveCount(0);
  });

  test("approve needs a reason and explicit confirmation in a dialog", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto(`/en/admin/providers/${LAB}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: COPY.approve }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: COPY.confirm })).toBeDisabled();
    await dialog.getByLabel(COPY.reason).fill("Synthetic licence evidence checked");
    await dialog.getByLabel(COPY.confirmCheckbox).check();
    await dialog.getByRole("button", { name: COPY.confirm }).click();
    await expect(visible(page.getByText(/^active$/i))).toBeVisible();
    // Decisions available afterwards follow the new state.
    await expect(page.getByRole("button", { name: COPY.suspend })).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.approve })).toHaveCount(0);
  });

  test("submitted application must be moved to review before a decision; then request changes", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto(`/en/admin/providers/${DOCTOR_SUBMITTED}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: COPY.approve })).toHaveCount(0);
    await page.getByRole("button", { name: COPY.startReview }).click();
    await page.getByRole("dialog").getByLabel(COPY.reason).fill("Starting synthetic review");
    await page.getByRole("dialog").getByRole("button", { name: COPY.confirm }).click();
    await expect(visible(page.getByText(/^under review$/i))).toBeVisible();

    await page.getByRole("button", { name: COPY.requestChanges }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(COPY.reason).fill("Registration copy unreadable (synthetic)");
    await dialog.getByLabel(COPY.confirmCheckbox).check();
    await dialog.getByRole("button", { name: COPY.confirm }).click();
    await expect(visible(page.getByText(/^changes requested$/i))).toBeVisible();
  });

  test("a stale tab gets a conflict message instead of overwriting", async ({ browser }) => {
    const a = await browser.newPage();
    const b = await browser.newPage();
    for (const p of [a, b]) {
      await signIn(p, ACCOUNTS.verifier);
      await p.goto(`/en/admin/providers/${LAB}`, { waitUntil: "domcontentloaded" });
    }
    for (const p of [a, b]) {
      await p.getByRole("button", { name: COPY.suspend }).click();
      await p.getByRole("dialog").getByLabel(COPY.reason).fill("Synthetic suspension test");
      await p.getByRole("dialog").getByLabel(COPY.confirmCheckbox).check();
    }
    await a.getByRole("dialog").getByRole("button", { name: COPY.confirm }).click();
    await b.getByRole("dialog").getByRole("button", { name: COPY.confirm }).click();
    await expect(b.getByRole("alert")).toContainText(/changed since you opened/i);
  });
});

test.describe("coverage management", () => {
  test("approve a proposed PIN with reason and confirmation; audit-style status updates", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto("/en/admin/coverage?state=proposed", { waitUntil: "domcontentloaded" });
    const row = page.getByRole("row").filter({ hasText: "500001" });
    await row.getByRole("button", { name: COPY.approve }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(COPY.reason).fill("Synthetic PIN coverage confirmed");
    await dialog.getByLabel(COPY.confirmCheckbox).check();
    await dialog.getByRole("button", { name: COPY.confirm }).click();
    await page.goto("/en/admin/coverage?state=approved", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("row").filter({ hasText: "500001" })).toHaveCount(1);
  });

  test("invalid PIN filter is ignored", async ({ page }) => {
    await signIn(page, ACCOUNTS.verifier);
    await page.goto("/en/admin/coverage?pin=012345", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("row").filter({ hasText: "500002" })).toHaveCount(1);
  });
});

test.describe("admin access control", () => {
  test("non-admins are sent to their own landing and see no queue data", async ({ page }) => {
    test.setTimeout(90_000); // three sign-ins and nine navigations
    for (const account of [ACCOUNTS.patientComplete, ACCOUNTS.doctorActive, ACCOUNTS.labOwner]) {
      await signIn(page, account);
      // Wrong role: requireRole redirects to the account's own landing page.
      const landing = new URL(page.url()).pathname;
      expect(landing).not.toMatch(/^\/en\/admin/);
      for (const path of ["/en/admin/providers", `/en/admin/providers/${LAB}`, "/en/admin/coverage"]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(landing);
        await expect(page.getByText(/synthetic diagnostics/i)).toHaveCount(0);
      }
      await page.context().clearCookies();
    }
  });
});
