/**
 * Doctor post-visit documents (R7-D): consultation notes (task 2) and prescription drafts (task 3).
 * Synthetic fixture world only; `page` = assigned-doctor server (see workspace-servers.ts).
 * Notes and drafts are stored per server process, so each viewport project starts clean; tests that
 * share a document run serially.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsOrigin, type WorkspaceServer } from "./workspace-servers";

const test = base.extend<{ as: (who: WorkspaceServer) => Promise<Page> }>({
  baseURL: async ({}, provide, testInfo) => provide(wsOrigin(testInfo.project.name, "assigned")),
  as: async ({ browser, viewport }, provide, testInfo) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await provide(async (who) => {
      const ctx = await browser.newContext({ baseURL: wsOrigin(testInfo.project.name, who), viewport });
      contexts.push(ctx);
      return ctx.newPage();
    });
    for (const c of contexts) await c.close();
  },
});

const notes = (id: string) => `/en/doctor/consultations/${id}`;
const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Flat 0", "Synthetic note text"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
async function expectCleanStorage(page: Page) {
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const m of PHI_MARKERS) expect(dump).not.toContain(m);
  for (const m of PHI_MARKERS) expect(decodeURIComponent(page.url())).not.toContain(m);
}
/** Every visible button/link in main is at least 44px tall (WCAG 2.5.8 target size, project rule). */
async function expectTargetSize(page: Page) {
  const small = await page.getByRole("main").evaluate((m) =>
    [...m.querySelectorAll<HTMLElement>("button, a[href], input[type=checkbox]")]
      .filter((el) => el.offsetParent !== null && !el.closest("nav[aria-label='Breadcrumb']"))
      .map((el) => {
        const box = (el.tagName === "INPUT" ? el.closest("label") ?? el : el).getBoundingClientRect();
        return { t: (el.textContent || el.getAttribute("aria-label") || el.id).trim().slice(0, 40), h: Math.round(box.height) };
      })
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
}
const badge = (page: Page, label: RegExp) => page.getByRole("region", { name: /visit and status/i }).getByRole("term").filter({ hasText: label }).locator("xpath=following-sibling::dd[1]");

test.describe("consultation notes: access and gate", () => {
  test("anonymous -> login with a safe next", async ({ as }) => {
    const page = await as("anon");
    await page.goto(notes(I.bookingPast));
    await expect(page).toHaveURL(new RegExp(`/en/login\\?next=${encodeURIComponent(notes(I.bookingPast))}$`));
  });

  test("another doctor gets the denied state", async ({ as }) => {
    const page = await as("other");
    await page.goto(notes(I.bookingPast));
    await expect(page.getByRole("main").getByText(/you do not have access/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("clinical flag off: gate notice and no form", async ({ as }) => {
    const page = await as("gateOff");
    await page.goto(notes(I.bookingPast));
    await expect(page.getByRole("main").getByText(/consultation notes are switched off/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("a booking that is not completed shows separate badges and no editor", async ({ page }) => {
    await page.goto(notes(I.bookingActive));
    await expect(page.getByText(/notes open after the visit is completed/i)).toBeVisible();
    await expect(badge(page, /^booking$/i)).toHaveText(/in progress/i);
    await expect(badge(page, /^notes$/i)).toHaveText(/not started/i);
    await expect(badge(page, /^payment$/i)).toHaveText(/due|not started|paid/i);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("malformed booking ID is not found", async ({ page }) => {
    await page.goto(notes("not..an..id"));
    await expect(page.getByRole("main").getByText(/^not found/i)).toBeVisible();
  });
});

test.describe("consultation notes: draft -> sign-off (serial)", () => {
  test.describe.configure({ mode: "serial" });

  test("visit page links completed visits to their notes", async ({ page }) => {
    await page.goto(`/en/doctor/visits/${I.bookingPast}`);
    await expect(page.getByRole("link", { name: /consultation notes/i })).toHaveAttribute("href", notes(I.bookingPast));
  });

  test("keyboard only: write the summary and save a draft; nothing is stored in the browser", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await expect(badge(page, /^booking$/i)).toHaveText(/completed/i);
    await expect(badge(page, /^payment$/i)).toHaveText(/paid/i);
    await expectNoAxeViolations(page);
    const summary = page.getByRole("textbox", { name: /visit summary/i });
    await summary.focus();
    await page.keyboard.type("Synthetic note text: reviewed at home.");
    await expect(page.getByRole("status").filter({ hasText: /unsaved changes/i })).toBeVisible();
    // Tab forward to Save draft and press it.
    const save = page.getByRole("button", { name: /save draft/i });
    for (let i = 0; i < 12 && !(await save.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: /draft saved/i })).toBeVisible();
    await expectCleanStorage(page);
    await page.reload();
    await expect(page.getByRole("textbox", { name: /visit summary/i })).toHaveValue("Synthetic note text: reviewed at home.");
    await expect(badge(page, /^notes$/i)).toHaveText(/draft/i);
    await expectNoHorizontalScroll(page);
    await expectTargetSize(page);
  });

  test("sign-off with missing details shows a focused error summary linking to each field", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await page.getByRole("button", { name: /sign off notes/i }).click();
    const summary = page.getByRole("alert").filter({ hasText: /advice given is required/i });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(/confirm the notes are accurate/i);
    await summary.getByRole("link", { name: /advice given is required/i }).click();
    await expect(page.getByRole("textbox", { name: /advice given/i })).toBeFocused();
    await expect(page.getByRole("textbox", { name: /advice given/i })).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations(page);
  });

  test("complete, attest and sign off -> read-only signed notes", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await page.getByRole("textbox", { name: /advice given/i }).fill("Synthetic advice: rest and fluids.");
    await page.getByRole("checkbox", { name: /i confirm these notes are accurate/i }).check();
    await page.getByRole("button", { name: /sign off notes/i }).click();
    await expect(page.getByRole("heading", { level: 2, name: /signed-off notes/i })).toBeVisible();
    await expect(page.getByText(/signed off by dr\. fixture asha \(synthetic\)/i)).toBeVisible();
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
    await expect(badge(page, /^notes$/i)).toHaveText(/signed off/i);
    await expect(page.getByText("Synthetic advice: rest and fluids.")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("consultation notes: te/hi", () => {
  for (const locale of ["te", "hi"] as const) {
    test(`${locale}: translated, no raw keys, no overflow, axe clean`, async ({ page }) => {
      await page.goto(`/${locale}/doctor/consultations/${I.bookingActive}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.getByRole("main").innerText()).not.toMatch(/\b(consultationNotes|doctor|common)\.[a-zA-Z]+\.[a-zA-Z.]+/);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
