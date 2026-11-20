/**
 * R8-D step 2: choose/type BEFORE hydration (JS chunks held back), then let React hydrate.
 *
 * Contract: what the doctor sees must be what gets submitted. Either the control refuses input
 * until hydration, or the typed value is kept in React state. Before the fix, controlled forms
 * kept the typed text on screen while React state stayed empty, so "Record collection" reported
 * "Choose a method" next to a select showing "Cash" (docs/frontend/REQUESTS.md R-FE-D-40).
 *
 * Uses bookings no other spec mutates: the past booking's collection form and patient B's
 * completed booking for notes / prescription drafts.
 */
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsOrigin } from "./workspace-servers";

const test = base.extend({
  baseURL: async ({}, provide, testInfo) => provide(wsOrigin(testInfo.project.name, "assigned")),
});

/** Load the server HTML but hold every JS chunk until `release()`: a very slow phone, deterministically. */
async function loadWithoutJs(page: Page, url: string): Promise<() => Promise<void>> {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return async () => {
    open();
    await page.waitForLoadState("networkidle");
  };
}

/** Try to type/choose before hydration. false = the control refused (disabled), which is allowed. */
const tryFill = (l: Locator, v: string) => l.fill(v, { timeout: 1500 }).then(() => true, () => false);
const trySelect = (l: Locator, v: string) => l.selectOption(v, { timeout: 1500 }).then(() => true, () => false);

test.describe("input before hydration is never silently lost", () => {
  test("collection form (controlled select + amount)", async ({ page }) => {
    const release = await loadWithoutJs(page, `/en/doctor/visits/${I.bookingPast}`);
    const method = page.getByLabel("Collection method");
    const amount = page.getByLabel("Amount collected (₹)");
    const early = { method: await trySelect(method, "cash"), amount: await tryFill(amount, "800") };
    await release();
    await expect(method).toBeEnabled();
    // The doctor completes only what the screen shows as empty, then submits.
    if ((await method.inputValue()) !== "cash") await method.selectOption("cash");
    if ((await amount.inputValue()) !== "800") await amount.fill("800");
    await page.getByRole("button", { name: "Record collection" }).click();
    await expect(page.getByText(/collection recorded: ₹800/i)).toBeVisible();
    await expect(page.getByText(/choose a method/i)).toHaveCount(0);
    test.info().annotations.push({ type: "pre-hydration", description: JSON.stringify(early) });
  });

  test("consultation notes (controlled textarea)", async ({ page }) => {
    const release = await loadWithoutJs(page, `/en/doctor/consultations/${I.bookingPatientB}`);
    const summary = page.getByRole("textbox", { name: /visit summary/i });
    const early = await tryFill(summary, "Synthetic text typed before hydration");
    await release();
    await expect(summary).toBeEnabled();
    if ((await summary.inputValue()) === "") await summary.fill("Synthetic text typed before hydration");
    // State must match the screen: typed text counts as unsaved and is what Save sends.
    await expect(page.getByRole("status").filter({ hasText: /unsaved changes/i })).toBeVisible();
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /draft saved/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: /visit summary/i })).toHaveValue("Synthetic text typed before hydration");
    test.info().annotations.push({ type: "pre-hydration", description: String(early) });
  });

  test("prescription draft (controlled selects + inputs)", async ({ page }) => {
    const release = await loadWithoutJs(page, `/en/doctor/consultations/${I.bookingPatientB}/prescription`);
    const name = page.getByRole("textbox", { name: /medicine name/i });
    const form = page.getByRole("combobox", { name: /^form/i });
    const early = { name: await tryFill(name, "Synthetic early med"), form: await trySelect(form, "tablet") };
    await release();
    await expect(name).toBeEnabled();
    if ((await name.inputValue()) !== "Synthetic early med") await name.fill("Synthetic early med");
    if ((await form.inputValue()) !== "tablet") await form.selectOption("tablet");
    await page.getByRole("combobox", { name: /when to take/i }).selectOption("once_daily");
    await page.getByRole("textbox", { name: /how many days/i }).fill("3");
    await page.getByRole("combobox", { name: /instruction/i }).selectOption("none");
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /draft saved/i })).toBeVisible();
    await expect(page.getByText(/enter the name of medicine 1|choose the form of medicine 1/i)).toHaveCount(0);
    test.info().annotations.push({ type: "pre-hydration", description: JSON.stringify(early) });
  });

  test("proof check entry (uncontrolled GET form) works with no JavaScript at all", async ({ page }) => {
    await loadWithoutJs(page, "/en/verify");
    const field = page.getByRole("textbox", { name: /proof code/i });
    expect(await tryFill(field, "0123 4567 89ab cdef 0123 4567 89ab cdef")).toBe(true);
    await field.press("Enter");
    // Plain HTML form submit + server redirect: no hydration needed.
    await expect(page).toHaveURL(/\/en\/verify\/0123456789abcdef0123456789abcdef$/, { timeout: 15_000 });
  });
});

/**
 * R8-D6: shared controls outside fe-d's own forms. The home page ServiceFinder
 * (src/components/public/service-finder.tsx, owner fe2-a) is a controlled form: `value={pin}` and
 * `checked={service === key}`. Reproduced: a PIN typed and a service chosen before hydration are
 * visibly CLEARED when React hydrates (state "" wins), and Find then reports "Enter your 6-digit
 * PIN code" and "Choose a service". Recorded in docs/frontend/REQUESTS.md R-FE-D-41.
 * `test.fail()` keeps the suite green while the bug exists; it turns red once fe2-a applies the
 * fix, and then this line should be removed.
 */
test.describe("shared controls: input before hydration (R-FE-D-41)", () => {
  test("home service finder keeps a PIN and service chosen before hydration", async ({ page }) => {
    test.fail(true, "Known bug R-FE-D-41 in src/components/public/service-finder.tsx (fe2-a)");
    const release = await loadWithoutJs(page, "/en");
    const form = page.locator("form:has(input[name=pin])").first();
    const pin = form.locator("input[name=pin]");
    const early = await tryFill(pin, "500001");
    const chose = await form.locator("label:has(input[value=labTests])").click({ timeout: 1500 }).then(() => true, () => false);
    await release();
    test.info().annotations.push({ type: "pre-hydration", description: JSON.stringify({ pin: early, service: chose }) });
    // Contract: either the controls refused early input, or what was entered survives hydration.
    if (early) await expect(pin, "PIN typed before hydration").toHaveValue("500001", { timeout: 2000 });
    if (chose) await expect(form.locator("input[value=labTests]"), "service chosen before hydration").toBeChecked({ timeout: 2000 });
    await form.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/en\/lab-tests\?pin=500001$/, { timeout: 5000 });
  });
});
