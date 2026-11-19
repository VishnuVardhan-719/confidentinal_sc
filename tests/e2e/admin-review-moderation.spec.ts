/**
 * fe-p R8-P2: admin review-moderation queue. Needs the "on" fixture server, which also sets
 * FIXTURE_ADMIN_SESSION=moderator (server env, fixture mode only; a synthetic admin holding only
 * review:moderate). Mobile publishes SYN-BKG-0301, desktop declines SYN-BKG-0302, so the two
 * parallel projects never decide the same review. In other modes the page must redirect to login.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const MODE = process.env.E2E_FEP_MODE;
const CLINICAL = process.env.E2E_FEP_CLINICAL;
const narrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("review moderation (synthetic moderator)", () => {
  test.skip(MODE !== "session" || CLINICAL !== "on", "needs the on-mode server with FIXTURE_ADMIN_SESSION=moderator");

  test("pending queue shows reviews without patient identity; filters are URL state", async ({ page }) => {
    await page.goto("/en/admin/reviews");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Review moderation" })).toBeVisible();
    const filters = main.getByRole("navigation", { name: "Filter reviews" });
    await expect(filters.getByRole("link", { name: "Waiting", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(main.getByText("Synthetic queue review three", { exact: false })).toBeVisible();
    await expect(main).not.toContainText(/patient(Id)?[:=]|00000000-0000-4000-8000-0000000000a1/i);
    await expect(main.getByRole("button", { name: /^Publish the review for booking SYN-BKG-03/ }).first()).toBeVisible();
    expect(page.url()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    if (narrow(page)) {
      const menu = page.getByRole("button", { name: "Open menu" });
      await expect(async () => {
        if (!(await page.getByRole("dialog").isVisible())) await menu.click();
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
      }).toPass();
    }
    await expect(page.getByRole("link", { name: "Review moderation" }).first()).toHaveAttribute("href", "/en/admin/reviews");
    if (narrow(page)) await page.keyboard.press("Escape");
    await expectAxeClean(page);
    await filters.getByRole("link", { name: "Published", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin\/reviews\?status=published$/);
    await expect(main.getByRole("button", { name: /^Publish the review/ })).toHaveCount(0);
  });

  test("publish one review, or decline another with a required reason", async ({ page }) => {
    await page.goto("/en/admin/reviews");
    const main = page.getByRole("main");
    if (narrow(page)) {
      await main.getByRole("button", { name: "Publish the review for booking SYN-BKG-0301", exact: true }).click();
      await expect(main.getByText("Review published.")).toBeVisible();
      await expect(main.getByText("SYN-BKG-0301")).toHaveCount(0);
      await page.goto("/en/admin/reviews?status=published");
      await expect(main.getByRole("listitem").filter({ hasText: "SYN-BKG-0301" })).toContainText("Published");
    } else {
      await main.getByRole("button", { name: "Do not publish the review for booking SYN-BKG-0302", exact: true }).click();
      const dialog = page.getByRole("alertdialog", { name: "Do not publish this review?" }).or(page.getByRole("dialog", { name: "Do not publish this review?" }));
      await expect(dialog).toBeVisible();
      const confirm = dialog.getByRole("button", { name: "Do not publish", exact: true });
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel("Reason").selectOption({ label: "Advertising or spam" });
      await confirm.click();
      await expect(main.getByText("Review not published. The patient will see the reason.")).toBeVisible();
      await page.goto("/en/admin/reviews?status=rejected");
      const row = main.getByRole("listitem").filter({ hasText: "SYN-BKG-0302" });
      await expect(row).toContainText("Not published");
      await expect(row).toContainText("Reason: Advertising or spam");
    }
  });

  test("te and hi render the queue without raw keys and pass axe", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      await page.goto(`/${locale}/admin/reviews`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(/admin\.reviews\.|patientAccount\./);
      await expectAxeClean(page);
    }
  });
});

test.describe("review moderation (no admin session)", () => {
  test.skip(MODE === "session" && CLINICAL === "on", "the on-mode server has a synthetic moderator");
  test.skip(!MODE, "needs a fixture server");

  test("redirects to login", async ({ page }) => {
    await page.goto("/en/admin/reviews");
    await expect(page).toHaveURL(/\/en\/login\?/);
  });
});
