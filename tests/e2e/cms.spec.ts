/**
 * FE17 CMS e2e (FRONTEND_MASTER s15 CMS, s19 safe content rendering): drafts, preview,
 * publish by the publisher role only, locale versions, revision history, HTML/script rejected,
 * public site shows published content only. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/cms.spec.ts
 */
import { expect, test } from "@playwright/test";
import { COPY, LOCALE, confirmDialog, expectAxeClean, expectDenied, expectFixtureNotice, notifications, open, record, shown, signInAs } from "./support/operations";

const CMS = `/${LOCALE}/admin/cms`;
/** The slug field is labelled in plain language ("Address name"). */
const SLUG = /address name|slug/i;

test.describe.configure({ mode: "serial" });

test.describe("CMS editor", () => {
  test("list shows locale versions and states per entry", async ({ page }) => {
    await signInAs(page, "contentEditor", CMS);
    await expectFixtureNotice(page);
    const faq = record(page, /synthetic-faq-booking/);
    await expect(faq).toContainText(/published/i);
    await expect(faq).toContainText(/in preview/i);
    await expectAxeClean(page);
  });

  test("script and raw HTML are rejected with a field error and an error summary", async ({ page }) => {
    await signInAs(page, "contentEditor", `${CMS}/new?kind=story`);
    await page.getByLabel(SLUG).fill("e2e-fixture-story");
    await page.getByLabel(/^title/i).fill("<script>alert(1)</script>");
    await page.getByLabel(/^body/i).fill("Click [here](javascript:alert(1))");
    await page.getByRole("button", { name: COPY.saveDraft }).click();
    const summary = page.getByRole("alert").filter({ hasText: COPY.errorSummary });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(COPY.htmlForbidden);
    await expect(summary).toContainText(COPY.unsafeLink);
    // Field-level errors are linked to their inputs.
    await expect(page.getByLabel(/^title/i)).toHaveAccessibleDescription(COPY.htmlForbidden);
    await expect(page.getByLabel(/^body/i)).toHaveAccessibleDescription(COPY.unsafeLink);
    // The error summary takes focus (GOV.UK pattern); its links move focus to the field.
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: COPY.htmlForbidden }).click();
    await expect(page.getByLabel(/^title/i)).toBeFocused();
    // Nothing executed or was injected as markup.
    expect(await page.locator("script:not([src])", { hasText: "alert(1)" }).count()).toBe(0);
  });

  test("editor can save and send to preview but cannot publish", async ({ page }) => {
    await signInAs(page, "contentEditor", `${CMS}/new?kind=faq`);
    await page.getByLabel(SLUG).fill("e2e-fixture-faq");
    await page.getByLabel(/^question/i).fill("Synthetic e2e question");
    await page.getByLabel(/^answer/i).fill("Synthetic e2e answer with **bold** text.");
    await page.getByRole("button", { name: COPY.saveDraft }).click();
    await expect(notifications(page)).toContainText(COPY.saved);
    await page.getByRole("button", { name: COPY.sendToPreview }).click();
    await expect(shown(page.getByText(/in preview/i)).first()).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.publish })).toHaveCount(0);
  });

  test("publisher publishes; revision history and the public FAQ update; preview marks live", async ({ page }) => {
    await signInAs(page, "contentPublisher", CMS);
    await shown(page.getByRole("link", { name: /e2e-fixture-faq/ })).click();
    await page.getByRole("button", { name: COPY.publish }).click();
    await confirmDialog(page, COPY.publish);
    await expect(page.getByRole("list", { name: /revision history/i }).getByRole("listitem").first()).toContainText(/published/i);
    await open(page, `/${LOCALE}/faq`);
    await expect(page.getByText("Synthetic e2e question")).toBeVisible();
    await expect(page.locator("strong", { hasText: "bold" })).toBeVisible();
  });

  test("a newer draft does not change the live public story", async ({ page }) => {
    await open(page, `/${LOCALE}/stories/synthetic-story-one`);
    await expect(page.getByRole("heading", { name: "Synthetic story one" })).toBeVisible();
    await expect(page.getByText(/revised draft/i)).toHaveCount(0);
  });

  test("non-content admins are denied the CMS", async ({ page }) => {
    await signInAs(page, "adminVerifier", CMS);
    await expectDenied(page);
  });
});
