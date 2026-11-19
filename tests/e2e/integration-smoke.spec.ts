import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./support/identity";
import { PERSONA_EMAILS } from "./support/operations";

/**
 * Integration smoke (fe-int2): every area of the merged app renders behind the real fe-b guards
 * at 390px and 1280px, with no error boundary, no horizontal scroll and no axe WCAG 2.1 A/AA
 * violations. SYNTHETIC fixture accounts only (@example.invalid). Read-only: nothing is mutated.
 * Config: tests/e2e/integration.config.ts (server on :3320).
 */

type Area = { name: string; email: string | null; routes: string[] };

const AREAS: Area[] = [
  { name: "public", email: null, routes: ["/en", "/te", "/hi", "/en/doctors", "/en/how-it-works", "/en/faq", "/en/stories", "/en/emergency", "/en/login", "/en/signup"] },
  {
    name: "patient",
    email: ACCOUNTS.patientComplete,
    routes: ["/en/patient/dashboard", "/en/patient/bookings", "/en/patient/book", "/en/patient/records", "/en/patient/notifications", "/en/patient/family", "/en/patient/lab-tests", "/en/patient/profile", "/te/patient/dashboard"],
  },
  { name: "doctor", email: ACCOUNTS.doctorActive, routes: ["/en/doctor/dashboard", "/en/doctor/requests", "/en/doctor/visits", "/en/doctor/availability", "/en/doctor/profile"] },
  { name: "lab", email: PERSONA_EMAILS.labManager, routes: ["/en/lab/dashboard", "/en/lab/orders", "/en/lab/collections"] },
  { name: "ambulance", email: PERSONA_EMAILS.ambulanceOperator, routes: ["/en/ambulance/dashboard", "/en/ambulance/requests", "/en/ambulance/fleet"] },
  { name: "caretaker", email: PERSONA_EMAILS.agencyManager, routes: ["/en/caretaker/dashboard", "/en/caretaker/requests", "/en/caretaker/shifts"] },
  { name: "admin", email: PERSONA_EMAILS.adminLead, routes: ["/en/admin/dashboard", "/en/admin/providers", "/en/admin/bookings", "/en/admin/cms"] },
];

// /en/lab-tests is not built yet (public lab directory pending on fe2-c, allow-listed in route-links.test.ts).
const ERROR_TEXT = /something went wrong|application error|unhandled runtime error/i;

/** Waits for streamed Suspense segments to be revealed (React keeps hidden copies until then). */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 15_000 }).catch(() => undefined);
}

async function contextFor(browser: Browser, email: string | null, use: { viewport: { width: number; height: number } | null; baseURL?: string }): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: use.viewport, baseURL: use.baseURL });
  if (email) {
    const page = await context.newPage();
    await signIn(page, email);
    await page.close();
  }
  return context;
}

for (const area of AREAS) {
  test.describe(`${area.name} area`, () => {
    let context: BrowserContext;
    test.beforeAll(async ({ browser }, info) => {
      const use = info.project.use as { viewport: { width: number; height: number } | null; baseURL?: string };
      context = await contextFor(browser, area.email, use);
    });
    test.afterAll(async () => context?.close());

    for (const route of area.routes) {
      test(`${route} renders, no overflow, axe clean`, async () => {
        const page = await context.newPage();
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        await settle(page);
        expect(response?.status() ?? 0, "HTTP status").toBeLessThan(400);
        // Still inside the area (a guard bounce would land on login or another workspace).
        const landed = new URL(page.url()).pathname;
        expect(landed, "landed path").toBe(route);
        await expect(page.locator("main").first()).toBeVisible();
        await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
        await expect(page.locator("body")).not.toContainText(ERROR_TEXT);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(1);
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const violations = axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
        test.info().annotations.push({ type: "axe", description: violations.join("; ") || "none" });
        expect(violations, "axe violations").toEqual([]);
        await page.close();
      });
    }
  });
}

test.describe("real guards", () => {
  test("signed-out visitor is sent to login with a safe return path", async ({ page }) => {
    await page.goto("/en/patient/records");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fpatient%2Frecords/);
  });

  test("record detail never puts the record ID in the login URL", async ({ page }) => {
    await page.goto("/en/patient/records/00000000-0000-4000-8000-000000000203");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fpatient%2Frecords$/);
  });

  test("wrong role lands on its own workspace (patient -> doctor area)", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await page.goto("/en/doctor/dashboard");
    await expect(page).toHaveURL(/\/en\/patient\/dashboard/);
  });

  test("doctor cannot open the lab workspace (doctor -> lab area)", async ({ page }) => {
    await signIn(page, ACCOUNTS.doctorActive);
    await page.goto("/en/lab/dashboard");
    await expect(page).toHaveURL(/\/en\/doctor\/dashboard/);
  });

  test("public header shows the signed-in account's dashboard link", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await page.goto("/en/how-it-works");
    await settle(page);
    const inHeader = page.locator("header").getByRole("link", { name: /dashboard/i }).filter({ visible: true });
    if ((await inHeader.count()) === 0) {
      // Narrow screens keep account actions in the menu sheet.
      await page.locator("header").getByRole("button", { name: /menu/i }).filter({ visible: true }).first().click();
      await expect(page.getByRole("dialog").getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
    } else {
      await expect(inHeader.first()).toBeVisible();
    }
  });
});
