/**
 * fe-p R7: saved doctors against the synthetic fixture app. Modes as in patient-family.spec.ts:
 * session + clinical on (seeded: "Synthetic doctor 1" saved), session + clinical off
 * (FIXTURE_SAVED_SCENARIO=empty), guest. The store is shared by both browser projects, so the
 * save/unsave test saves a doctor and removes it again in one test, and asserts by name only.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { patientTest } from "./support/fixture-session";

// Redirects, client navigations and server actions on a shared, often loaded machine; 5 s was flaky.
const expect = baseExpect.configure({ timeout: 15_000 });

const MODE = process.env.E2E_FEP_MODE;
const CLINICAL = process.env.E2E_FEP_CLINICAL;

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
const savedList = (page: Page) => page.getByRole("main").getByRole("region", { name: /saved doctor/ });
const suggestList = (page: Page) => page.getByRole("main").getByRole("region", { name: "Doctors you can save" });

patientTest.describe("saved doctors (signed-in, seeded)", () => {
  patientTest.skip(MODE !== "session" || CLINICAL !== "on", "needs the session fixture server (seeded saved list)");

  patientTest("saved list shows directory details, a profile link and a remove button", async ({ page }) => {
    await page.goto("/en/patient/saved");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Saved doctors" })).toBeVisible();
    await expect(main.getByText("Synthetic data, not live")).toBeVisible();
    const card = savedList(page).getByRole("listitem").filter({ hasText: "Synthetic doctor 1" });
    await expect(card).toContainText("Hyderabad");
    await expect(card).toContainText(/Fee ₹500\.00 per visit/);
    await expect(card.getByRole("link", { name: "View profile of Synthetic doctor 1" })).toHaveAttribute("href", "/en/doctors/00000000-0000-4000-8000-000000000001");
    await expect(card.getByRole("button", { name: "Remove Synthetic doctor 1 from saved" })).toBeVisible();
    await expect(suggestList(page).getByText("Synthetic doctor 1")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  patientTest("save a suggested doctor, then remove it; results are announced", async ({ page, isMobile }) => {
    // Each project uses its own doctor so the two parallel runs do not race on one row.
    const name = isMobile || (page.viewportSize()?.width ?? 1280) < 1024 ? "Synthetic doctor 2" : "Synthetic doctor 4"; // doctor 3 has no open slots, so search leaves it out
    await page.goto("/en/patient/saved");
    const save = suggestList(page).getByRole("button", { name: `Save ${name}` });
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByRole("main").getByText("Doctor saved.")).toBeAttached();
    await expect(savedList(page).getByRole("listitem").filter({ hasText: name })).toBeVisible();
    await expect(suggestList(page).getByText(name)).toHaveCount(0);

    await savedList(page).getByRole("button", { name: `Remove ${name} from saved` }).click();
    await expect(page.getByRole("main").getByText("Doctor removed from saved.")).toBeAttached();
    await expect(savedList(page).getByText(name)).toHaveCount(0);
    await expect(suggestList(page).getByRole("button", { name: `Save ${name}` })).toBeVisible();
  });

  patientTest("keyboard: Tab reaches the save button and Enter saves", async ({ page, isMobile }) => {
    const name = isMobile || (page.viewportSize()?.width ?? 1280) < 1024 ? "Synthetic doctor 5" : "Synthetic doctor 6";
    await page.goto("/en/patient/saved");
    const save = suggestList(page).getByRole("button", { name: `Save ${name}` });
    await suggestList(page).getByRole("link", { name: `View profile of ${name}` }).focus();
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    const remove = savedList(page).getByRole("button", { name: `Remove ${name} from saved` });
    await expect(remove).toBeVisible();
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(savedList(page).getByText(name)).toHaveCount(0);
  });

  patientTest("te and hi render without raw keys and pass axe", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      await page.goto(`/${locale}/patient/saved`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(/patientAccount\.|saved\.(state|empty)\.|search\.specialities\./);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
  });
});

patientTest.describe("saved doctors (signed-in, empty)", () => {
  patientTest.skip(MODE !== "session" || CLINICAL !== "off", "needs FIXTURE_SAVED_SCENARIO=empty");

  patientTest("empty state links to the directory and suggestions are still offered", async ({ page }) => {
    await page.goto("/en/patient/saved");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "No saved doctors yet" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Find a doctor" })).toHaveAttribute("href", "/en/doctors");
    await expect(suggestList(page).getByRole("button", { name: /^Save / }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

test.describe("saved doctors (guest)", () => {
  test.skip(MODE !== "guest", "needs the guest-mode fixture server");

  test("redirects to login with a safe return path", async ({ page }) => {
    for (const locale of ["en", "te", "hi"]) {
      await page.goto(`/${locale}/patient/saved`);
      await expect(page).toHaveURL(/\/(en|te|hi)\/login\?/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(`/${locale}/patient/saved`);
    }
  });
});
