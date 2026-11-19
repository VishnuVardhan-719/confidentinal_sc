/**
 * Role isolation across the operations areas (requireRole in src/modules/admin/session.ts):
 * - signed out: every area page sends the visitor to /<locale>/login?next=<that path>;
 * - signed in with another role: the page redirects to the user's own landing page and shows
 *   none of the requested area's synthetic data.
 * Read-only: no fixture state changes. Synthetic data only.
 *
 * Run: FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/role-isolation.spec.ts
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./support/identity";
import { LOCALE, settle, signInAs, type Persona } from "./support/operations";

type Area = "lab" | "ambulance" | "caretaker" | "admin";
const AREAS: readonly Area[] = ["lab", "ambulance", "caretaker", "admin"];
const dashboard = (area: Area | "patient") => `/${LOCALE}/${area}/dashboard`;

/** Synthetic records each area's dashboard shows (src/fixtures/operations/*.ts). */
const AREA_DATA: Record<Area, (page: Page) => Locator[]> = {
  lab: (page) => [page.getByText(/Synthetic Lab Branch (North|South)/), page.getByText(/#SCV-BKG-9001\d\d/)],
  ambulance: (page) => [page.getByText(/Fixture Van \d/), page.getByText(/Fixture Driver [A-C]/), page.getByText(/#SCV-BKG-9003\d\d/)],
  caretaker: (page) => [page.getByText("Synthetic Care Agency"), page.getByText(/Fixture Caregiver [A-C]/), page.getByText(/#SCV-BKG-9004\d\d/)],
  admin: (page) => [page.getByTestId(/^queue-/), page.getByText(/#SCV-SUP-\d{6}/)],
};

async function expectNoAreaData(page: Page, area: Area): Promise<void> {
  for (const locator of AREA_DATA[area](page)) await expect(locator, `no ${area} data`).toHaveCount(0);
}

/** Positive control: the area's own dashboard does show these records, so the absence checks mean something. */
async function expectAreaData(page: Page, area: Area): Promise<void> {
  let visible = 0;
  for (const locator of AREA_DATA[area](page)) visible += await locator.filter({ visible: true }).count();
  expect(visible, `${area} dashboard shows its own synthetic data`).toBeGreaterThan(0);
}

async function expectRedirectedHome(page: Page, from: Area, home: string): Promise<void> {
  await page.goto(dashboard(from));
  await expect(page).toHaveURL((u) => u.pathname === home);
  await settle(page);
  await expectNoAreaData(page, from);
}

test.describe("signed-out visitors", () => {
  for (const area of AREAS) {
    test(`${area} dashboard sends the visitor to sign in with a return path`, async ({ page }) => {
      await page.goto(dashboard(area));
      await expect(page).toHaveURL((u) => u.pathname === `/${LOCALE}/login` && u.searchParams.get("next") === dashboard(area));
      await expectNoAreaData(page, area);
    });
  }
});

const PERSONAS: readonly { persona: Persona; area: Area }[] = [
  { persona: "labManager", area: "lab" },
  { persona: "ambulanceOperator", area: "ambulance" },
  { persona: "agencyManager", area: "caretaker" },
  { persona: "adminLead", area: "admin" },
];

test.describe("signed in with another role", () => {
  for (const { persona, area } of PERSONAS) {
    test(`${persona} is sent back to the ${area} dashboard from every other area`, async ({ page }) => {
      await signInAs(page, persona, dashboard(area));
      await expectAreaData(page, area);
      for (const other of AREAS.filter((a) => a !== area)) await expectRedirectedHome(page, other, dashboard(area));
    });
  }

  test("a patient is sent to the patient landing page from every operations area", async ({ page }) => {
    await signIn(page, "patient.complete@example.invalid");
    for (const area of AREAS) await expectRedirectedHome(page, area, dashboard("patient"));
  });
});
