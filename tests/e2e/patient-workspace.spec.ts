/**
 * Patient workspace e2e (dashboard, records, notifications). Synthetic fixture world only.
 * "Signed in as" = a synthetic fixture account through the real fe-b guards (tests/e2e/workspace-servers.ts):
 * `page` = multi.role (patient + assigned doctor); "anon" is not signed in; "gateOff" runs only in the
 * E2E_CLINICAL=off pass against a server without FEATURE_CLINICAL.
 * The doctor spec may run against the same servers in parallel, so assertions tolerate new signed
 * records (DC07) and only this file mutates notifications (mark all read runs last).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsTest } from "./workspace-servers";

// Signed in through the real fe-b guards (tests/e2e/workspace-servers.ts).
const test = wsTest;

const P = "/en/patient";
const path = {
  dashboard: `${P}/dashboard`,
  records: `${P}/records`,
  record: (id: string) => `${P}/records/${id}`,
  notifications: `${P}/notifications`,
};

/** Synthetic strings that must never appear in URLs or browser storage. */
const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Synthetic allergy entry", "Synthetic complaint", "Flat 0"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function expectNoPhiInUrlOrStorage(page: Page) {
  const url = decodeURIComponent(page.url());
  for (const m of PHI_MARKERS) expect(url, "URL must not contain PHI").not.toContain(m);
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const m of PHI_MARKERS) expect(dump, "browser storage must not contain PHI").not.toContain(m);
}

async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

const main = (page: Page) => page.getByRole("main");

test.describe("patient guard", () => {
  for (const p of [path.dashboard, path.records, path.notifications]) {
    test(`anonymous ${p} redirects to login with a safe next`, async ({ as }) => {
      const page = await as("anon");
      await page.goto(p);
      await expect(page).toHaveURL(new RegExp(`/en/login\\?next=${encodeURIComponent(p)}$`));
    });
  }
});

test.describe("patient dashboard", () => {
  test("synthetic notice, overview, separate badges, recent notifications and nav", async ({ page }) => {
    await page.goto(path.dashboard);
    await expect(main(page).getByText(/synthetic data, not live/i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /your overview/i })).toBeVisible();
    const recent = page.getByRole("region", { name: /recent notifications/i });
    await expect(recent.getByRole("listitem")).toHaveCount(3);
    await expect(recent.getByRole("link", { name: /all notifications/i })).toHaveAttribute("href", path.notifications);
    await expect(page.getByRole("link", { name: /my health records/i })).toHaveAttribute("href", path.records);
    await expectNoPhiInUrlOrStorage(page);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("patient records (DC09, DC14)", () => {
  // Integration serves fe-p's records pages (record ID kept out of the login URL); the same behaviour is
  // covered by patient-records.spec.ts with fe-p's copy. These assertions target fe-d's page copy.
  test.fixme("list shows signed records only, newest first, with version and reference", async ({ page }) => {
    await page.goto(path.records);
    await expect(page.getByRole("heading", { level: 1, name: /health records/i })).toBeVisible();
    const open = page.getByRole("link", { name: /open record for SYN-BKG-0104/i });
    await expect(open).toHaveAttribute("href", path.record(I.consultationPastFinal));
    // Every listed item is a signed record; the active draft (SYN-BKG-0106) appears only once the
    // doctor spec has signed it, and then also as signed.
    const items = main(page).getByRole("listitem");
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < n; i++) await expect(items.nth(i)).toContainText(/signed/i);
    await expectNoPhiInUrlOrStorage(page);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  // Integration serves fe-p's records pages (record ID kept out of the login URL); the same behaviour is
  // covered by patient-records.spec.ts with fe-p's copy. These assertions target fe-d's page copy.
  test.fixme("detail shows the signed record read-only and a private PDF link for the signed version", async ({ page }) => {
    await page.goto(path.record(I.consultationPastFinal));
    await expect(page.getByRole("heading", { level: 1, name: /health record/i })).toBeVisible();
    await expect(main(page).getByText("Version 1", { exact: true })).toBeVisible();
    await expect(main(page).getByText(/signed by dr\. fixture asha \(synthetic\)/i)).toBeVisible();
    await expect(main(page).getByRole("textbox")).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: /add amendment/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Get PDF link" }).click();
    await expect(page.getByRole("link", { name: /download pdf.*version 1/i })).toBeVisible();
    await expectNoPhiInUrlOrStorage(page);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  // Integration serves fe-p's records pages (record ID kept out of the login URL); the same behaviour is
  // covered by patient-records.spec.ts with fe-p's copy. These assertions target fe-d's page copy.
  test.fixme("malformed IDs and other consultations read as not found", async ({ page }) => {
    for (const id of ["not..an..id", "00000000-0000-4000-8000-000000000999"]) {
      await page.goto(path.record(id));
      await expect(main(page).getByText(/^not found/i)).toBeVisible();
    }
  });

  // fe-p's records pages are served; their gate state is covered by patient-records.spec.ts (clinical off).
  test.fixme("clinical gate off: records pages show the gate and request no clinical data", async ({ as }) => {
    const page = await as("gateOff");
    await page.goto(path.records);
    await expect(main(page).getByText(/clinical features are not enabled/i)).toBeVisible();
    await expect(main(page).getByRole("link", { name: /open record/i })).toHaveCount(0);
    await page.goto(path.record(I.consultationPastFinal));
    await expect(main(page).getByText(/clinical features are not enabled/i)).toBeVisible();
    await expect(main(page).getByText(/signed by/i)).toHaveCount(0);
  });
});

test.describe("patient notifications", () => {
  test.describe.configure({ mode: "serial" });

  test("list uses templates only (no PHI) and links to in-app pages", async ({ page }) => {
    await page.goto(path.notifications);
    await expect(page.getByRole("heading", { level: 1, name: /notifications/i })).toBeVisible();
    const list = page.getByRole("list", { name: /all notifications/i });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("status").filter({ hasText: /unread notification/i })).toHaveText(/2 unread notifications/i);
    await expect(list.getByRole("link", { name: /open record/i })).toHaveAttribute("href", path.record(I.consultationPastFinal));
    for (const m of PHI_MARKERS) await expect(main(page).getByText(m)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("mark all as read updates the list from the server", async ({ page }) => {
    await page.goto(path.notifications);
    await page.getByRole("button", { name: /mark all as read/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /unread notification/i })).toHaveText(/no unread notifications/i);
    await expect(main(page).getByText("Unread", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /mark all as read/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: /unread notification/i })).toHaveText(/no unread notifications/i);
  });
});

test.describe("te/hi patient and doctor pages", () => {
  for (const locale of ["te", "hi"] as const) {
    for (const p of ["/patient/dashboard", "/patient/records", `/patient/records/${I.consultationPastFinal}`, "/patient/notifications", "/doctor/availability", "/doctor/dashboard"]) {
      test(`${locale}${p} renders translated text without raw keys or overflow`, async ({ page }) => {
        await page.goto(`/${locale}${p}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // A missing message renders its key path (e.g. "patient.records.title"): none may appear.
        const text = await main(page).innerText();
        expect(text).not.toMatch(/\b(patient|clinical|doctor|common|errors)\.[a-zA-Z]+\.[a-zA-Z.]+/);
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      });
    }
  }
});
