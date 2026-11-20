/**
 * R7-D task 4: doctor reviews view (read-only, moderation badges). Synthetic fixture world only.
 * `page` = assigned doctor (synthetic: 2 published, 1 awaiting moderation, 1 not published, plus 1
 * withdrawn row the client drops; R9-D8 D1/D2); "other" = a doctor with no reviews (empty state); "gateOff" = flag off.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
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

const URL_ = "/en/doctor/reviews";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
const list = (page: Page) => page.getByRole("list", { name: /^reviews$/i });
const unpublished = (page: Page) => page.getByRole("region", { name: /not shown yet/i });

test.describe("doctor reviews", () => {
  test("summary, published cards only, unpublished as counts, no patient identity", async ({ page }) => {
    await page.goto(URL_);
    await expect(page.getByRole("heading", { level: 1, name: /^reviews$/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /overall/i })).toContainText("4.5");
    await expect(page.getByRole("region", { name: /overall/i })).toContainText(/from 2 published reviews/i);
    // D2: only published reviews get a card (with their date); the rest are counts with no date or month.
    await expect(list(page).getByRole("listitem")).toHaveCount(2);
    await expect(list(page).getByText(/^submitted /i)).toHaveCount(2);
    await expect(unpublished(page)).toContainText("1 review waiting for moderation");
    await expect(unpublished(page)).toContainText("1 review not published by moderation");
    await expect(unpublished(page).getByText(/submitted|visit in/i)).toHaveCount(0);
    await expect(page.getByText(/^submitted /i)).toHaveCount(2);
    // D1: the fixture feed carries a withdrawn row; it is dropped, never shown, and the page still works.
    await expect(page.getByText(/must not reach the doctor|withdrawn/i)).toHaveCount(0);
    await expect(page.getByText(/Fixture Patient|SYN-BKG/)).toHaveCount(0);
    // Read-only: no reply/hide/edit controls, and no status filters any more.
    await expect(list(page).getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /filter reviews/i })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("an old ?status= link is ignored and never lists unpublished reviews", async ({ page }) => {
    for (const q of ["pending_moderation", "rejected", "bogus"]) {
      await page.goto(`${URL_}?status=${q}`);
      await expect(list(page).getByRole("listitem")).toHaveCount(2);
      await expect(page.getByText(/must not reach the doctor/i)).toHaveCount(0);
    }
    await expectNoAxeViolations(page);
  });
  test("doctor nav links to reviews", async ({ page }) => {
    await page.goto("/en/doctor/dashboard");
    // At 390px non-primary items live in the workspace menu.
    const link = page.getByRole("link", { name: /^reviews$/i }).filter({ visible: true });
    if ((await link.count()) === 0) await page.getByRole("button", { name: /open menu/i }).click();
    await expect(link.first()).toHaveAttribute("href", URL_);
  });

  test("a doctor without reviews sees the empty state; flag off shows the gate; anonymous goes to login", async ({ as }) => {
    const other = await as("other");
    await other.goto(URL_);
    await expect(other.getByRole("heading", { level: 2, name: /no reviews yet/i })).toBeVisible();
    await expectNoAxeViolations(other);
    const off = await as("gateOff");
    await off.goto(URL_);
    await expect(off.getByRole("main").getByText(/reviews are switched off/i)).toBeVisible();
    await expect(off.getByRole("list", { name: /^reviews$/i })).toHaveCount(0);
    const anon = await as("anon");
    await anon.goto(URL_);
    await expect(anon).toHaveURL(new RegExp(`/en/login\\?next=${encodeURIComponent(URL_)}$`));
  });

  for (const locale of ["te", "hi"] as const) {
    test(`${locale}: translated, no raw keys, no overflow, axe clean`, async ({ page }) => {
      await page.goto(`/${locale}/doctor/reviews`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.getByRole("main").innerText()).not.toMatch(/\b(doctorReviews|doctor|common)\.[a-zA-Z]+\.[a-zA-Z.]+/);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
