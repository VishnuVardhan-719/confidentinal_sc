import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Public ambulance and caretaker directories (/ambulances, /caretakers) in fixture mode, signed out, at 390 and
 * 1280. List by PIN, provider page, unknown id, 108 first on every ambulance page, non-clinical scope on every
 * caretaker page, metadata, three locales. Every state is axe-clean (WCAG 2 A/AA), has no horizontal scroll and
 * leaves browser storage empty. It stops at the request links: the requests themselves are covered by
 * service-requests.spec.ts.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
test.skip(!FIXTURE, "needs the synthetic fixture adapter");

const OPERATOR_1 = "00000000-0000-4000-8400-000000000001";
const OPERATOR_3 = "00000000-0000-4000-8400-000000000003";
const CARETAKER_1 = "00000000-0000-4000-8300-000000000001";
const UNKNOWN = "00000000-0000-4000-8400-000000000099";

async function checkPage(page: Page, label: string) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.length}`), `axe ${label}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal scroll ${label}`).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => [Object.keys(localStorage).filter((k) => k !== "scv.location.v1").length, sessionStorage.length]), `storage ${label}`).toEqual([0, 0]);
}

/** The 108 notice sits above the page heading, so it is the first thing read and the first thing seen. */
async function expectEmergencyFirst(page: Page) {
  const banner = page.getByTestId("emergency-banner").filter({ visible: true });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Call 108" })).toHaveAttribute("href", "tel:108");
  const [bannerBox, headingBox] = await Promise.all([banner.boundingBox(), page.getByRole("heading", { level: 1 }).boundingBox()]);
  expect(bannerBox && headingBox && bannerBox.y < headingBox.y, "108 notice above the heading").toBe(true);
}

test.describe("public ambulance directory", () => {
  test("list, filter by PIN, open an operator, and reach the request link", async ({ page }) => {
    await page.goto("/en/ambulances");
    await expect(page.getByRole("heading", { level: 1, name: "Ambulance operators for planned transfers" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    await expectEmergencyFirst(page);
    const cards = page.getByTestId("service-provider-card").filter({ visible: true });
    await expect(cards).toHaveCount(3);
    await checkPage(page, "ambulances");

    await page.getByLabel("PIN code").fill("500081");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/en\/ambulances\?pin=500081$/);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Synthetic transfer operator 3");
    await expect(cards).toContainText("Wheelchair van");
    await expectEmergencyFirst(page);
    await checkPage(page, "ambulances?pin=500081");

    await page.getByRole("link", { name: "View operator: Synthetic transfer operator 3" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic transfer operator 3" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/en/ambulances/${OPERATOR_3}$`));
    await expectEmergencyFirst(page);
    const vehicles = page.getByTestId("ambulance-vehicle");
    await expect(vehicles).toHaveCount(1);
    await expect(vehicles).toContainText("Wheelchair van");
    await expect(vehicles).toContainText("₹800.00 per transfer");
    await expect(vehicles).toContainText("Cannot carry a stretcher");
    await expect(page.getByText("No live tracking or arrival time is shown.")).toBeVisible();
    await checkPage(page, "ambulance detail");

    const request = page.getByRole("link", { name: "Request a transfer from Synthetic transfer operator 3" });
    await expect(request).toHaveAttribute("href", `/en/patient/ambulance/request?providerId=${OPERATOR_3}`);
  });

  test("an operator that carries a stretcher does not say it cannot", async ({ page }) => {
    await page.goto(`/en/ambulances/${OPERATOR_1}`);
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic transfer operator 1" })).toBeVisible({ timeout: 20_000 });
    const vehicles = page.getByTestId("ambulance-vehicle");
    await expect(vehicles).toHaveCount(3);
    await expect(vehicles.filter({ hasText: "Patient transport with stretcher" })).not.toContainText("Cannot carry a stretcher");
    await expect(vehicles.filter({ hasText: "Wheelchair van" })).toContainText("Cannot carry a stretcher");
    await expect(vehicles.filter({ hasText: "Basic life support" })).toContainText("₹2,500.00 per transfer");
  });

  test("a PIN no operator serves shows an empty state; a malformed PIN is explained", async ({ page }) => {
    await page.goto("/en/ambulances?pin=999999");
    await expect(page.getByRole("heading", { level: 1, name: "Ambulance operators for planned transfers" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("service-provider-card")).toHaveCount(0);
    await expect(page.getByText("No providers serve this PIN yet")).toBeVisible();
    await expectEmergencyFirst(page);
    await checkPage(page, "ambulances empty");
    await page.goto("/en/ambulances?pin=12ab");
    await expect(page.locator("#provider-pin-error").filter({ visible: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("service-provider-card").filter({ visible: true })).toHaveCount(3);
    await checkPage(page, "ambulances invalid pin");
  });

  test("an unknown operator is a not-found page that still shows 108 first", async ({ page }) => {
    for (const id of [UNKNOWN, "not-an-id"]) {
      await page.goto(`/en/ambulances/${id}`);
      await expect(page.getByRole("heading", { level: 1, name: "This operator is not listed" })).toBeVisible({ timeout: 20_000 });
      await expectEmergencyFirst(page);
      await expect(page.getByRole("link", { name: "Back to operators" }).first()).toHaveAttribute("href", "/en/ambulances");
    }
    await checkPage(page, "ambulance not found");
  });

  test("canonical and hreflang metadata; operator pages are not indexed", async ({ page }) => {
    await page.goto("/te/ambulances");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/te\/ambulances$/);
    await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute("href", /\/hi\/ambulances$/);
    await page.goto(`/en/ambulances/${OPERATOR_1}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/en/ambulances/${OPERATOR_1}$`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  for (const [locale, heading, call] of [["te", "ముందుగా నిర్ణయించిన తరలింపుల కోసం అంబులెన్స్ ఆపరేటర్లు", "108"], ["hi", "पहले से तय स्थानांतरण के लिए एम्बुलेंस ऑपरेटर", "108"]] as const) {
    test(`${locale}: translated, 108 first, no raw message keys`, async ({ page }) => {
      await page.goto(`/${locale}/ambulances`);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("emergency-banner").getByRole("link", { name: new RegExp(call) })).toBeVisible();
      await expect(page.getByText(/services\.(ambulance|common)/)).toHaveCount(0);
      await checkPage(page, `${locale} ambulances`);
    });
  }
});

test.describe("public caretaker directory", () => {
  test("list, filter by PIN, open a caretaker, and reach the request link", async ({ page }) => {
    await page.goto("/en/caretakers");
    await expect(page.getByRole("heading", { level: 1, name: "Find a caretaker for home care" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    const cards = page.getByTestId("service-provider-card").filter({ visible: true });
    await expect(cards).toHaveCount(3);
    await expect(page.getByTestId("emergency-banner")).toHaveCount(0);
    await checkPage(page, "caretakers");

    await page.getByLabel("PIN code").fill("500032");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/en\/caretakers\?pin=500032$/);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Synthetic care agency 2");
    await checkPage(page, "caretakers?pin=500032");

    await page.getByRole("link", { name: "View caretaker: Synthetic care agency 2" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic care agency 2" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Care agency", { exact: true }).first()).toBeVisible();
    const tasks = page.getByTestId("care-task");
    await expect(tasks).toHaveCount(3);
    await expect(tasks.filter({ hasText: "Help with bathing and dressing" })).toHaveCount(1);
    await expect(page.getByText("₹300.00 per hour")).toBeVisible();
    await expect(page.getByText("4 to 12 hours per shift").first()).toBeVisible();
    await expect(page.getByText("Caretakers help with daily living. They do not give medical treatment")).toBeVisible();
    await expect(page.getByText("Regular or repeating care plans are not available yet.")).toBeVisible();
    await checkPage(page, "caretaker detail");

    const request = page.getByRole("link", { name: "Request care from Synthetic care agency 2" });
    await expect(request).toHaveAttribute("href", "/en/patient/caretakers/request?providerId=00000000-0000-4000-8300-000000000002");
  });

  test("a medicine task is a reminder only, never medicine", async ({ page }) => {
    await page.goto(`/en/caretakers/${CARETAKER_1}`);
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic caretaker 1" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("care-task").filter({ hasText: "Reminders to take medicines (reminding only)" })).toHaveCount(1);
    await expect(page.getByText("They do not give medical treatment, injections or medicines")).toBeVisible();
  });

  test("an unknown caretaker is a not-found page with a way back", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8300-000000000099", "not-an-id"]) {
      await page.goto(`/en/caretakers/${id}`);
      await expect(page.getByRole("heading", { level: 1, name: "This caretaker is not listed" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: "Back to caretakers" }).first()).toHaveAttribute("href", "/en/caretakers");
    }
    await checkPage(page, "caretaker not found");
  });

  test("canonical and hreflang metadata; caretaker pages are not indexed", async ({ page }) => {
    await page.goto("/hi/caretakers");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/hi\/caretakers$/);
    await expect(page.locator('link[rel="alternate"][hreflang="te"]')).toHaveAttribute("href", /\/te\/caretakers$/);
    await page.goto(`/en/caretakers/${CARETAKER_1}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  for (const [locale, heading] of [["te", "ఇంటి సంరక్షణ కోసం సంరక్షకులను వెతకండి"], ["hi", "घर की देखभाल के लिए देखभालकर्ता खोजें"]] as const) {
    test(`${locale}: translated, no raw message keys`, async ({ page }) => {
      await page.goto(`/${locale}/caretakers`);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/services\.(care|common)/)).toHaveCount(0);
      await checkPage(page, `${locale} caretakers`);
    });
  }
});

test("the landing page links reach the two directories", async ({ page }) => {
  await page.goto("/en");
  for (const path of ["/en/ambulances", "/en/caretakers"]) {
    await expect(page.locator(`a[href="${path}"]`).filter({ visible: true }).first()).toBeVisible();
  }
  await page.locator('a[href="/en/ambulances"]').filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Ambulance operators for planned transfers" })).toBeVisible({ timeout: 20_000 });
});
