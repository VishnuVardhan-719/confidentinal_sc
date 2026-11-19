/**
 * fe-p: patient records and notifications against the synthetic fixture app.
 *
 * Signed-in tests sign in as the synthetic patient through the real fe-b guards (support/fixture-session.ts);
 * guest tests use an anonymous context. The clinical flag is a SERVER env var:
 *   clinical on:  FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true (default run)
 *   clinical off: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_NOTIFICATION_SCENARIO=empty, run with E2E_CLINICAL=off Synthetic data only; fixture ids are not real records.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test as base, type Page } from "@playwright/test";
import { CLINICAL_OFF, patientTest as test } from "./support/fixture-session";

// Client navigations and server actions stream on a shared, often loaded dev machine; 5 s was flaky.
const expect = baseExpect.configure({ timeout: 15_000 });

const OWN_FINAL = "00000000-0000-4000-8000-000000000202";
const OWN_DRAFT = "00000000-0000-4000-8000-000000000201";
const OTHER_PATIENT = "00000000-0000-4000-8000-000000000203";
const NOT_AVAILABLE = "This record is not available. It may not exist, it may not be signed yet, or it is not on your account.";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function openNavIfCollapsed(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const menu = page.getByRole("button", { name: "Open menu" });
    // Retry until hydrated: a click before hydration does not open the sheet.
    await expect(async () => {
      if (!(await page.getByRole("dialog").isVisible())) await menu.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
    }).toPass();
  }
}

test.describe("patient records and notifications (clinical on)", () => {
  test.skip(CLINICAL_OFF, "needs the server with FEATURE_CLINICAL=true");

  test("records list shows only signed records with reference, signer and version", async ({ page }) => {
    await page.goto("/en/patient/records");
    await expect(page.getByRole("heading", { level: 1, name: "Your health records" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Synthetic data, not live")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "1 signed record" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^View record/ }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Signed by Dr. Fixture Asha (synthetic)");
    await expect(row).toContainText("Booking SYN-BKG-0104");
    await expect(row).toContainText("Version 1");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("record detail is read-only, signed, and offers a short-lived PDF link", async ({ page }) => {
    await page.goto("/en/patient/records");
    await page.getByRole("link", { name: "View record SYN-BKG-0104" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/patient/records/${OWN_FINAL}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Visit record" })).toBeVisible();
    await expect(page.getByText("Booking SYN-BKG-0104").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("Signed", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Amendments" })).toBeVisible();
    // The patient view never offers doctor actions.
    await expect(page.getByRole("button", { name: /amend|finalize|sign/i })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    const pdf = page.getByRole("complementary", { name: "Record download" });
    await pdf.getByRole("button", { name: "Get PDF link" }).click();
    const download = pdf.getByRole("link", { name: "Download PDF, version 1" });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute("rel", /noreferrer/);
    await expect(pdf.getByText("Link ready")).toBeVisible();
    // The signed URL is not placed in the page URL or browser storage.
    expect(page.url()).not.toContain("fixture.invalid");
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain("fixture.invalid");
  });

  test("drafts, other patients' records and malformed ids look the same: not available", async ({ page }) => {
    for (const id of [OWN_DRAFT, OTHER_PATIENT, "00000000-0000-4000-8000-000000000999", "not-a-record"]) {
      await page.goto(`/en/patient/records/${id}`);
      // Scoped to main: while the response streams, React briefly holds a hidden copy outside main.
      await expect(page.getByRole("main").getByText(NOT_AVAILABLE)).toBeVisible();
      await expect(page.getByRole("button", { name: "Get PDF link" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to records" })).toHaveAttribute("href", "/en/patient/records");
    }
  });

  // Integration chose fe-d's /patient/notifications page (patient-scoped store, unread count in the nav), so
  // this fe-p page design is not served; fe-d's page is covered by patient-workspace.spec.ts.
  test.fixme("notifications show kind and time only, with an unread marker and mark as read", async ({ page }) => {
    await page.goto("/en/patient/notifications");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Notifications \(1 unread\)/ })).toBeVisible();
    const item = page.getByRole("listitem").filter({ hasText: "A new booking request was sent" });
    await expect(item).toHaveCount(1);
    await expect(item.locator("time")).toHaveAttribute("datetime", "2026-11-18T00:00:00.000Z");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await item.getByRole("button", { name: "Mark as read" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /none unread/ })).toBeVisible();
    await expect(item.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
    // Scoped to main: the Next.js route announcer is an (empty) alert outside main.
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("te and hi render records and notifications without raw message keys", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      for (const path of ["patient/records", `patient/records/${OWN_FINAL}`, "patient/notifications"]) {
        await page.goto(`/${locale}/${path}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText(/\b(patient|clinical|common)\.[a-z]+\.[a-zA-Z.]+/);
      }
    }
  });

  test("patient nav links to records and notifications", async ({ page }) => {
    for (const start of ["/en/patient/records", "/en/patient/dashboard"]) {
      await page.goto(start);
      await openNavIfCollapsed(page);
      await expect(page.getByRole("link", { name: "Records", exact: true }).first()).toHaveAttribute("href", "/en/patient/records");
      // The nav label carries the server-derived unread count ("Notifications 2").
      await expect(page.getByRole("link", { name: /^Notifications\b/ }).first()).toHaveAttribute("href", "/en/patient/notifications");
    }
  });
});

test.describe("patient records and notifications (clinical off, empty inbox)", () => {
  test.skip(!CLINICAL_OFF, "needs the server without FEATURE_CLINICAL (E2E_CLINICAL=off)");

  test("records list and detail say clinical records are switched off", async ({ page }) => {
    for (const path of ["/en/patient/records", `/en/patient/records/${OWN_FINAL}`]) {
      await page.goto(path);
      const gate = page.getByRole("main").locator('[data-gate="clinical"]');
      await expect(gate).toContainText("Health records are switched off.");
      await expect(page.getByRole("link", { name: /^View record/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Get PDF link" })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
  });

  // fe-p's inbox (FIXTURE_NOTIFICATION_SCENARIO) is not the served page; see the note on the clinical-on inbox test.
  test.fixme("an empty inbox says so honestly", async ({ page }) => {
    await page.goto("/en/patient/notifications");
    await expect(page.getByRole("heading", { name: "No notifications" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Updates about your requests, bookings and payments will appear here.")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

base.describe("patient records and notifications (guest)", () => {
  base("private URLs redirect to login; a record id never travels in the return path", async ({ page }) => {
    for (const [path, next] of [
      ["/en/patient/records", "/en/patient/records"],
      [`/te/patient/records/${OWN_FINAL}`, "/te/patient/records"],
      ["/hi/patient/notifications", "/hi/patient/notifications"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/(en|te|hi)\/login\?/);
      const location = new URL(page.url());
      expect(location.pathname).toBe(`/${next.split("/")[1]}/login`);
      expect(location.searchParams.get("next")).toBe(next);
      // The login page itself labels the fixture adapter; no patient content may render there.
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).not.toHaveText(/record|notification/i);
    }
  });
});
