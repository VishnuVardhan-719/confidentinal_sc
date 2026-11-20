/**
 * fe-p R8-P2..R9-P4: admin review moderation (queue, decisions, read-only decision log).
 * The moderator comes from tests/e2e/support/fep-moderator.ts:
 *   - fe2-p: the "on" fixture server's FIXTURE_ADMIN_SESSION=moderator (no login page on fe2-p);
 *   - integration: a real fe-b sign-in as the synthetic lead admin (the server switch is gone).
 * Mobile publishes SYN-BKG-0301, desktop declines SYN-BKG-0302, so the two parallel projects never
 * decide the same review. Signed out, every moderation page redirects to login with its own path.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test as base, type Page } from "@playwright/test";
import { MODERATOR_AVAILABLE, SERVER_MODERATOR, moderatorTest as test } from "./support/fep-moderator";

const expect = baseExpect.configure({ timeout: 15_000 });
const narrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("review moderation (synthetic moderator)", () => {
  test.skip(!MODERATOR_AVAILABLE, "fe2-p off/guest servers have no moderator (the signed-out tests cover them)");

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
      await page.goto("/en/admin/reviews/log");
      const entry = main.getByRole("listitem").filter({ hasText: "SYN-BKG-0301" });
      await expect(entry).toHaveCount(1);
      await expect(entry).toContainText("Published");
      await expect(entry).toContainText("Decided by you");
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
      await page.goto("/en/admin/reviews/log");
      const entry = main.getByRole("listitem").filter({ hasText: "SYN-BKG-0302" });
      await expect(entry).toHaveCount(1);
      await expect(entry).toContainText("Not published");
      await expect(entry).toContainText("Reason: Advertising or spam");
      await expect(entry).toContainText("Decided by you");
    }
  });

  test("decision log is read-only, newest first, and carries no patient identity", async ({ page }) => {
    await page.goto("/en/admin/reviews");
    const main = page.getByRole("main");
    await main.getByRole("link", { name: "Decision log" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/reviews\/log$/);
    // Fresh load: after client navigation the router may keep the queue page mounted but hidden,
    // and its review text would leak into main's textContent.
    await page.reload();
    await expect(main.getByRole("heading", { level: 1, name: "Moderation decision log" })).toBeVisible();
    await expect(main.getByRole("heading", { level: 2, name: /\d+ decisions?$/ })).toBeVisible();
    const seeded = main.getByRole("listitem").filter({ hasText: "SYN-BKG-0206" });
    await expect(seeded).toContainText("Not published");
    await expect(seeded).toContainText("Reason: Not about the service");
    await expect(seeded).toContainText("Decided by another moderator");
    // No undo or any other control: the only interactive element in main is the way back.
    await expect(main.getByRole("button")).toHaveCount(0);
    await expect(main.locator("form, input, select, textarea")).toHaveCount(0);
    await expect(main.getByRole("link")).toHaveCount(1);
    await expect(main.getByRole("link", { name: "Back to review moderation" })).toHaveAttribute("href", "/en/admin/reviews");
    // Newest first: decision times are in descending order.
    const times = await main.locator("ol > li time").evaluateAll((els) => els.map((e) => e.getAttribute("datetime") ?? ""));
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times).toEqual([...times].sort().reverse());
    await expect(main).not.toContainText(/patient(Id)?[:=]|00000000-0000-4000-8000-0000000000(a1|c1|d2|ad)|Synthetic (queue )?review/i);
    await expectAxeClean(page);
  });

  test("cursor pages: past the end shows the end and a way back; bad or foreign cursors fall back to page one", async ({ page }) => {
    const main = page.getByRole("main");
    await page.goto("/en/admin/reviews/log?cursor=l999999");
    await expect(main.getByRole("heading", { level: 2, name: "0 decisions on this page" })).toBeVisible();
    const pager = main.getByRole("navigation", { name: "Review pages" });
    await expect(pager.getByText("End of the decision log")).toBeVisible();
    await expect(pager.getByRole("link", { name: "Back to first page" })).toHaveAttribute("href", "/en/admin/reviews/log");
    await expectAxeClean(page);
    // A queue cursor that belongs to another list is refused by the server: back to the first page.
    await page.goto("/en/admin/reviews?status=published&cursor=l1");
    await expect(page).toHaveURL(/\/en\/admin\/reviews\?status=published$/);
    // A malformed cursor is ignored before it reaches the server.
    await page.goto("/en/admin/reviews?status=published&cursor=..%2Fx");
    await expect(main.getByRole("heading", { level: 2, name: /^Published: \d+ reviews?$/ })).toBeVisible();
    await expect(main.getByRole("navigation", { name: "Review pages" })).toHaveCount(0);
  });
  test("te and hi render the queue without raw keys and pass axe", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      for (const path of ["/admin/reviews", "/admin/reviews/log"]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText(/admin\.reviews\.|patientAccount\./);
        await expectAxeClean(page);
      }
    }
  });
});

base.describe("review moderation (no admin session)", () => {
  base.skip(SERVER_MODERATOR, "the fe2-p on-mode server makes every request the synthetic moderator");

  base("redirects to login", async ({ page }) => {
    for (const path of ["/en/admin/reviews", "/en/admin/reviews/log"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/login\?/);
      // Sign-in returns to the page that was asked for (internal path only, no query).
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    }
  });
});
