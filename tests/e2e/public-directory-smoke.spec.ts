import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Public directory smoke (R9-C11): the signed-out happy path through the doctor and lab directories in fixture
 * mode, at 390 and 1280 (the two default projects). Every page state is axe-clean (WCAG 2 A/AA), has no
 * horizontal scroll and leaves browser storage empty. It stops at the request links: booking itself is covered by
 * booking-journey.spec.ts and service-requests.spec.ts.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
test.skip(!FIXTURE, "needs the synthetic fixture adapter");

async function checkPage(page: Page, label: string) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.length}`), `axe ${label}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal scroll ${label}`).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length]), `storage ${label}`).toEqual([0, 0]);
}

test.describe("public directory smoke", () => {
  test("doctors: search a symptom, open a profile, reach the request link", async ({ page }) => {
    await page.goto("/en/doctors");
    await expect(page.getByRole("heading", { level: 1, name: "Find a doctor" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    await checkPage(page, "doctors");

    // Typed text that is exactly a symptom label goes into the URL as its taxonomy key, not free text (finding 5).
    const box = page.getByRole("combobox", { name: "Search doctors, specialities or symptoms" });
    await box.fill("Fever");
    await box.press("Escape");
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    await expect(page).toHaveURL(/\/en\/doctors\?symptom=fever$/);
    expect(page.url()).not.toMatch(/[?&]q=/);
    const cards = page.getByTestId("doctor-card");
    await expect(cards.first()).toBeVisible();
    await checkPage(page, "doctors?symptom=fever");

    const first = cards.first();
    const name = (await first.getByRole("heading").first().textContent())?.trim() ?? "";
    expect(name).toMatch(/^Synthetic doctor \d+$/);
    await first.getByRole("link", { name: "View profile" }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
    await checkPage(page, "doctor profile");
    const request = page.getByRole("link", { name: "Request a visit" });
    await expect(request).toHaveAttribute("href", /^\/en\/patient\/book\?providerId=[0-9a-f-]{36}&serviceId=[0-9a-f-]{36}$/);
  });

  test("labs: filter by test and city, open a lab, reach the request link", async ({ page }) => {
    await page.goto("/en/lab-tests");
    await expect(page.getByRole("heading", { level: 1, name: "Find a lab test" })).toBeVisible({ timeout: 20_000 });
    await checkPage(page, "lab-tests");

    await page.getByLabel("Test name").fill("blood count");
    await page.getByLabel("City").selectOption("Secunderabad");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/en\/lab-tests\?test=blood\+count&city=Secunderabad$/);
    const cards = page.getByTestId("lab-card").filter({ visible: true });
    await expect(cards).toHaveCount(1);
    await checkPage(page, "lab-tests filtered");

    await cards.first().getByRole("link", { name: /^View lab: Synthetic lab \d+$/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Synthetic lab \d+$/ })).toBeVisible({ timeout: 20_000 });
    await checkPage(page, "lab detail");
    await expect(page.getByRole("link", { name: /^Request tests from Synthetic lab \d+$/ }))
      .toHaveAttribute("href", /^\/en\/patient\/lab-tests\/request\?providerId=[0-9a-f-]{36}$/);
  });
});
