/**
 * R7-D task 4: doctor reviews view (read-only, moderation badges). Synthetic fixture world only.
 * `page` = assigned doctor (4 synthetic reviews: 2 published, 1 awaiting moderation, 1 not published);
 * "other" = a doctor with no reviews (empty state); "gateOff" = flag off.
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
const filters = (page: Page) => page.getByRole("navigation", { name: /filter reviews/i });

test.describe("doctor reviews", () => {
  test("summary, moderation badges and no patient identity", async ({ page }) => {
    await page.goto(URL_);
    await expect(page.getByRole("heading", { level: 1, name: /^reviews$/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /overall/i })).toContainText("4.5");
    await expect(page.getByRole("region", { name: /overall/i })).toContainText(/from 2 published reviews/i);
    await expect(list(page).getByRole("listitem")).toHaveCount(4);
    await expect(list(page).getByText("Published", { exact: true })).toHaveCount(2);
    await expect(list(page).getByText("Awaiting moderation", { exact: true })).toHaveCount(1);
    await expect(list(page).getByText("Not published", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/must not reach the doctor/i)).toHaveCount(0);
    await expect(page.getByText(/Fixture Patient|SYN-BKG/)).toHaveCount(0);
    // Read-only: no reply/hide/edit controls in the list.
    await expect(list(page).getByRole("button")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("keyboard: filter links narrow the list and mark the current filter", async ({ page }) => {
    await page.goto(URL_);
    const pending = filters(page).getByRole("link", { name: /awaiting moderation \(1\)/i });
    await pending.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/doctor\/reviews\?status=pending_moderation$/);
    await expect(filters(page).getByRole("link", { name: /awaiting moderation/i })).toHaveAttribute("aria-current", "page");
    await expect(list(page).getByRole("listitem")).toHaveCount(1);
    await expect(list(page)).toContainText(/appear here once moderation publishes/i);
    await page.goto(`${URL_}?status=bogus`);
    await expect(filters(page).getByRole("link", { name: /^all/i })).toHaveAttribute("aria-current", "page");
    await expect(list(page).getByRole("listitem")).toHaveCount(4);
    await expectNoAxeViolations(page);
  });

  test("filter targets are at least 44px tall", async ({ page }) => {
    await page.goto(URL_);
    const heights = await filters(page).getByRole("link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
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
