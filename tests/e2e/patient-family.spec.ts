/**
 * fe-p R7: family members (add / edit / remove) against the synthetic fixture app.
 * Server modes (see .context/fep-serve.ps1): E2E_FEP_MODE=session with E2E_FEP_CLINICAL=on (seeded
 * store) or off (FIXTURE_FAMILY_SCENARIO=empty, store starts empty), or E2E_FEP_MODE=guest.
 * The fixture store is shared by every test on the server, so each test uses its own unique names
 * and only edits or removes members it created. Synthetic data only.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { patientTest } from "./support/fixture-session";

// Redirects, client navigations and server actions on a shared, often loaded machine; 5 s was flaky.
const expect = baseExpect.configure({ timeout: 15_000 });

const MODE = process.env.E2E_FEP_MODE;
const CLINICAL = process.env.E2E_FEP_CLINICAL;
const SEEDED = "Synthetic Parent (fixture)";

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
const uniqueName = (label: string) => `Synthetic ${label} ${Math.random().toString(36).slice(2, 7).replace(/\d/g, "x")}`;

async function addMember(page: Page, name: string, relation = "Child", dob = "2019-06-01") {
  await page.goto("/en/patient/family/new");
  const main = page.getByRole("main");
  await main.getByLabel("Full name").fill(name);
  await main.getByLabel("Relation to you").selectOption({ label: relation });
  await main.getByLabel("Date of birth").fill(dob);
  await main.getByRole("button", { name: "Save family member" }).click();
  await expect(page).toHaveURL(/\/en\/patient\/family\?status=added$/);
  await expect(main.getByText("Family member added.")).toBeVisible();
}

patientTest.describe("family members (signed-in, seeded)", () => {
  patientTest.skip(MODE !== "session" || CLINICAL !== "on", "needs the session fixture server (seeded family store)");

  patientTest("list shows the seeded synthetic member with relation and age", async ({ page }) => {
    await page.goto("/en/patient/family");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Family members" })).toBeVisible();
    await expect(main.getByText("Synthetic data, not live")).toBeVisible();
    const card = main.getByRole("listitem").filter({ hasText: SEEDED });
    await expect(card).toContainText("Parent");
    await expect(card).toContainText(/\d+ years · Born 12 Apr 1958/);
    await expect(card.getByRole("link", { name: `Edit ${SEEDED}` })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  patientTest("empty submit shows a focused error summary linked to each field", async ({ page }) => {
    await page.goto("/en/patient/family/new");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Save family member" }).click();
    const summary = main.getByRole("alert").filter({ hasText: "Enter their full name." });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link")).toHaveText(["Enter their full name.", "Choose how they are related to you.", "Enter their date of birth."]);
    await expect(main.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    await summary.getByRole("link", { name: "Choose how they are related to you." }).click();
    await expect(main.getByLabel("Relation to you")).toBeFocused();
    await expectAxeClean(page);

    await main.getByLabel("Full name").fill("1234");
    await main.getByLabel("Relation to you").selectOption({ label: "Child" });
    await main.getByLabel("Date of birth").fill("2099-01-01");
    await main.getByRole("button", { name: "Save family member" }).click();
    await expect(main.getByRole("alert").getByRole("link")).toHaveText(["Use letters, spaces, dots, apostrophes or hyphens only.", "Date of birth cannot be in the future."]);
    await expect(page).toHaveURL(/\/en\/patient\/family\/new$/);
  });

  patientTest("add, edit and remove a member; URLs carry only an opaque id", async ({ page }) => {
    const name = uniqueName("Child");
    await addMember(page, name);
    const main = page.getByRole("main");
    await main.getByRole("link", { name: `Edit ${name}` }).click();
    await expect(page).toHaveURL(/\/en\/patient\/family\/[0-9a-f-]{36}$/);
    expect(decodeURIComponent(page.url())).not.toContain(name);
    await expect(main.getByLabel("Full name")).toHaveValue(name);
    await main.getByLabel("Relation to you").selectOption({ label: "Brother or sister" });
    await main.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/status=updated$/);
    await expect(main.getByText("Changes saved.")).toBeVisible();
    await expect(main.getByRole("listitem").filter({ hasText: name })).toContainText("Brother or sister");

    await main.getByRole("link", { name: `Edit ${name}` }).click();
    await main.getByRole("button", { name: "Remove family member" }).click();
    const dialog = page.getByRole("alertdialog", { name: `Remove ${name}?` }).or(page.getByRole("dialog", { name: `Remove ${name}?` }));
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page).toHaveURL(/status=removed$/);
    await expect(main.getByText("Family member removed.")).toBeVisible();
    await expect(main.getByText(name)).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain("Synthetic");
  });

  patientTest("keyboard-only add (en-IN date order: day, month, year)", async ({ browser, baseURL, patientStorage }) => {
    const context = await browser.newContext({ locale: "en-IN", baseURL, storageState: patientStorage });
    const page = await context.newPage();
    const name = uniqueName("Keyboard");
    await page.goto("/en/patient/family");
    const main = page.getByRole("main");
    await main.getByRole("link", { name: "Add family member" }).first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/patient\/family\/new$/);
    await main.getByLabel("Full name").focus();
    await page.keyboard.type(name);
    await page.keyboard.press("Tab");
    await expect(main.getByLabel("Relation to you")).toBeFocused();
    await main.getByLabel("Relation to you").selectOption("parent"); // native select: keyboard opens the OS list
    await page.keyboard.press("Tab");
    await expect(main.getByLabel("Date of birth")).toBeFocused();
    await page.keyboard.type("15031960");
    await expect(main.getByLabel("Date of birth")).toHaveValue("1960-03-15");
    // Chrome's native date field can keep focus on its last segment for one extra Tab.
    const save = main.getByRole("button", { name: "Save family member" });
    for (let i = 0; i < 3 && !(await save.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(main.getByText("Family member added.")).toBeVisible();
    await expect(main.getByRole("listitem").filter({ hasText: name })).toContainText("Parent");
    await context.close();
  });

  patientTest("unknown and malformed ids show the same not-available state", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8000-0000000000f9", "not-a-member"]) {
      await page.goto(`/en/patient/family/${id}`);
      await expect(page.getByRole("main").getByText("This family member is not available.", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    }
  });

  patientTest("te and hi render the list and the form without raw keys; axe clean", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      for (const path of ["patient/family", "patient/family/new"]) {
        await page.goto(`/${locale}/${path}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText(/patientAccount\.|family\.(form|relation|state)\./);
        await expectNoHorizontalScroll(page);
      }
      await expectAxeClean(page);
    }
  });
});

patientTest.describe("family members (signed-in, empty store)", () => {
  patientTest.skip(MODE !== "session" || CLINICAL !== "off", "needs the session fixture server with FIXTURE_FAMILY_SCENARIO=empty");

  patientTest("empty state offers the add action", async ({ page }) => {
    await page.goto("/en/patient/family");
    const main = page.getByRole("main");
    // No test adds members in this mode, so the store stays empty.
    await expect(main.getByRole("heading", { name: "No family members added" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Add family member" })).toHaveAttribute("href", "/en/patient/family/new");
    await expect(main.getByText(SEEDED)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

test.describe("family members (guest)", () => {
  test.skip(MODE !== "guest", "needs the guest-mode fixture server");

  test("redirects to login with the family list as the return path", async ({ page }) => {
    for (const [path, next] of [["/en/patient/family", "/en/patient/family"], ["/te/patient/family/new", "/te/patient/family"], ["/hi/patient/family/00000000-0000-4000-8000-0000000000f1", "/hi/patient/family"]]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/(en|te|hi)\/login\?/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    }
  });
});
