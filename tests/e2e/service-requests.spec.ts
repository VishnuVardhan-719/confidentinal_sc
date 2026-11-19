import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Patient lab tests, caretaker and scheduled ambulance requests (PHASE-R6-C). Synthetic fixture adapter only,
 * with the server started as FIXTURE_PATIENT_SESSION=self and a short FIXTURE_PROVIDER_RESPONSE_MS. The request
 * stores live in the server process, so each test picks its own slot column per project and recovers when another
 * run took the slot first.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
test.skip(!FIXTURE, "needs the synthetic fixture adapter");

const NOTE = "Synthetic e2e note: ring the bell twice";

async function expectAxeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map(v => `${label}: ${v.id} ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectFitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function expectNoPrivateDraft(page: Page) {
  expect(decodeURIComponent(page.url())).not.toContain("bell");
  const leaked = await page.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes("bell"))));
  expect(leaked).toBe(false);
}
const column = (projectName: string) => (projectName === "mobile-390" ? 0 : -1);

/** Pick a day and a time by position; negative positions count from the end. */
async function pickSlot(scope: Locator, day: number, time: number) {
  const days = scope.getByRole("group", { name: "Day", exact: true }).locator("label");
  await expect(days.first()).toBeVisible({ timeout: 15_000 });
  const dayCount = await days.count();
  await days.nth(Math.max(0, Math.min(day < 0 ? dayCount + day : day, dayCount - 1))).click();
  const times = scope.getByRole("group", { name: /^Time on / }).locator("label");
  const timeCount = await times.count();
  const chosen = times.nth(Math.max(0, Math.min(time < 0 ? timeCount + time : time, timeCount - 1)));
  await chosen.click();
  await expect(chosen.getByRole("radio")).toBeChecked();
}

/** Send; if the slot was taken meanwhile, the form says so and keeps every other answer. Pick another time. */
async function sendWithRetry(page: Page, timeGroup: Locator, slot: { day: number; time: number }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Send request" }).click();
    const changed = page.getByText("Something changed", { exact: true });
    await expect(page.getByRole("heading", { level: 1, name: /with Synthetic/ }).or(changed).first()).toBeVisible({ timeout: 20_000 });
    if (!(await changed.isVisible())) return;
    await pickSlot(timeGroup, slot.day, slot.time < 0 ? slot.time - attempt - 1 : slot.time + attempt + 1);
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
  }
}

async function waitForAnswer(page: Page, title: string) {
  await expect(async () => {
    const refresh = page.getByRole("button", { name: "Check for updates" });
    await expect(refresh).toBeEnabled({ timeout: 15_000 });
    await refresh.click();
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

async function expectBadges(page: Page, booking: string, payment: string, record: string) {
  const list = page.getByLabel("Statuses");
  await expect(list.getByRole("definition").nth(0)).toHaveText(booking);
  await expect(list.getByRole("definition").nth(1)).toHaveText(payment);
  await expect(list.getByRole("definition").nth(2)).toHaveText(record);
}

async function cancelRequest(page: Page) {
  await page.getByRole("button", { name: "Cancel request" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
  await expect(dialog.getByRole("button", { name: "Cancel booking" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "My plans changed" }).check();
  await dialog.getByRole("checkbox", { name: /I have read the cancellation terms/ }).check();
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("This request is cancelled", { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Press Tab until `target` has focus (fails if not reachable within `max` presses). */
async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test.describe("lab tests", () => {
  test("discover by PIN: invalid PIN, filtered list, empty state", async ({ page }) => {
    await page.goto("/en/patient/lab-tests");
    await expect(page.getByRole("heading", { level: 1, name: "Lab tests at home" })).toBeVisible();
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTestId("service-provider-card")).toHaveCount(3);
    await expectAxeClean(page, "lab/list");
    await expectFitsViewport(page);
    await page.getByLabel("PIN code").fill("12");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Enter a 6-digit PIN code that does not start with 0.")).toBeVisible();
    await page.getByLabel("PIN code").fill("500081");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/pin=500081$/);
    await expect(page.getByText("1 provider serving PIN 500081")).toBeVisible();
    await expect(page.getByTestId("service-provider-card")).toHaveText(/Synthetic lab 3/);
    await page.goto("/en/patient/lab-tests?pin=600001");
    await expect(page.getByText("No providers serve this PIN yet")).toBeVisible();
    await expectAxeClean(page, "lab/empty");
  });

  test("happy path: choose tests and time, lab accepts, patient cancels", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/lab-tests");
    await page.getByRole("link", { name: "Request tests: Synthetic lab 1" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Request tests from Synthetic lab 1" })).toBeVisible({ timeout: 20_000 });

    // Validation: one summary, focused, linking to each missing answer.
    await page.getByRole("button", { name: "Send request" }).click();
    const summary = page.getByRole("alert").filter({ hasText: /problem/ });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Choose at least one test.");
    await expect(summary).toContainText("Choose a time.");
    await expect(summary).toContainText("Confirm you will follow the preparation.");
    await expect(summary).toContainText("Accept the price and the cancellation policy.");
    await expectAxeClean(page, "lab/form-errors");

    await expect(page.getByRole("radio", { name: /Synthetic patient/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Home: Synthetic locality, Synthetic city, PIN 500001/ })).toBeChecked();
    await page.getByRole("checkbox", { name: /Complete blood count/ }).check();
    await page.getByRole("checkbox", { name: /Fasting blood sugar/ }).check();
    await expect(page.getByText("Do not eat for 10 hours before. Water is fine.").last()).toBeVisible();
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 1, col);
    await page.getByRole("checkbox", { name: "I will follow the preparation shown for these tests." }).check();
    await page.getByLabel(/Anything the provider should know/).fill(NOTE);
    const price = page.getByTestId("request-price");
    await expect(price).toContainText("Complete blood count");
    await expect(price).toContainText("Home collection");
    await expect(price).toContainText("₹600.00");
    await expect(page.getByRole("radio", { name: /Pay online/ })).toHaveCount(0);
    await expect(page.getByText("Online payment is not available yet.")).toBeVisible();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    await expectNoPrivateDraft(page);
    await expectAxeClean(page, "lab/form");
    await expectFitsViewport(page);
    await sendWithRetry(page, timeGroup, { day: 1, time: col });

    await expect(page).toHaveURL(/\/en\/patient\/lab-tests\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Home sample collection with Synthetic lab 1" })).toBeVisible();
    // The synthetic lab answers after FIXTURE_PROVIDER_RESPONSE_MS; on a slow machine the first render may already show it.
    const waiting = page.getByText("Waiting for Synthetic lab 1 to answer");
    await expect(waiting.or(page.getByText("Synthetic lab 1 accepted your request")).first()).toBeVisible({ timeout: 15_000 });
    if (await waiting.isVisible()) {
      await expect(page.getByText("You get a reference number when the provider accepts.")).toBeVisible();
      await expectBadges(page, "Requested", "Not started", "No report yet");
      await expectAxeClean(page, "lab/pending");
    }

    await waitForAnswer(page, "Synthetic lab 1 accepted your request");
    await expect(page.getByText(/^Reference SCV-[0-9A-F]{6}$/)).toBeVisible();
    await expectBadges(page, "Confirmed", "Payment due", "No report yet");
    await expect(page.getByRole("complementary", { name: "Price" })).toContainText("₹600.00");
    await expectAxeClean(page, "lab/confirmed");
    await expectFitsViewport(page);
    await cancelRequest(page);
    await expectBadges(page, "Cancelled", "Not started", "No report yet");
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
  });

  test("decline path: the lab declines and the patient is pointed elsewhere", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/lab-tests/request?providerId=00000000-0000-4000-8200-000000000002");
    await page.getByRole("checkbox", { name: /Lipid profile/ }).check();
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 0, col);
    await page.getByRole("checkbox", { name: "I will follow the preparation shown for these tests." }).check();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    await sendWithRetry(page, timeGroup, { day: 0, time: col });
    await waitForAnswer(page, "Synthetic lab 2 could not take this request");
    await expect(page.getByText("You have not been charged. Choose another provider or time.")).toBeVisible();
    await expectBadges(page, "Declined", "Not started", "No report yet");
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expectAxeClean(page, "lab/declined");
    await page.getByRole("link", { name: "Find another provider" }).click();
    await expect(page).toHaveURL(/\/en\/patient\/lab-tests$/, { timeout: 20_000 });
  });

  test("a lab outside every saved address cannot be requested", async ({ page }) => {
    await page.goto("/en/patient/lab-tests/request?providerId=00000000-0000-4000-8200-000000000003");
    await expect(page.getByText("None of your saved addresses is in this area")).toBeVisible();
    await expect(page.getByRole("group", { name: "Address" }).getByRole("radio", { checked: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: /Vitamin D/ }).check();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /problem/ })).toContainText("Choose an address in this provider's area.");
  });

  test("keyboard only: request lab tests without a pointer", async ({ page }, info) => {
    test.setTimeout(150_000);
    const last = info.project.name !== "mobile-390";
    await page.goto("/en/patient/lab-tests");
    await tabTo(page, page.getByRole("link", { name: "Request tests: Synthetic lab 1" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Request tests from Synthetic lab 1" })).toBeVisible({ timeout: 20_000 });
    await tabTo(page, page.getByRole("checkbox", { name: /Thyroid profile/ })); await page.keyboard.press("Space");
    const dayGroup = page.getByRole("group", { name: "Day", exact: true });
    await tabTo(page, dayGroup.getByRole("radio").first());
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await expect(dayGroup.getByRole("radio").nth(2)).toBeChecked();
    const timeGroup = page.getByRole("group", { name: /^Time on / });
    await tabTo(page, timeGroup.getByRole("radio").first()); await page.keyboard.press("Space");
    if (last) await page.keyboard.press("ArrowLeft");
    await expect(timeGroup.getByRole("radio", { checked: true })).toHaveCount(1);
    await tabTo(page, page.getByRole("checkbox", { name: "I will follow the preparation shown for these tests." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("button", { name: "Send request" })); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/patient\/lab-tests\/requests\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible({ timeout: 15_000 });
    await tabTo(page, page.getByRole("button", { name: "Check for updates" })); await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeEnabled({ timeout: 15_000 });
    await tabTo(page, page.getByRole("button", { name: "Cancel request" })); await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("radio").first()); await page.keyboard.press("Space");
    await tabTo(page, dialog.getByRole("checkbox", { name: /I have read the cancellation terms/ })); await page.keyboard.press("Space");
    await tabTo(page, dialog.getByRole("button", { name: "Cancel booking" })); await page.keyboard.press("Enter");
    // The lab may have answered in between; a version conflict reloads the page and the patient confirms again.
    await expect(async () => {
      if (await dialog.getByRole("button", { name: "Cancel booking" }).isVisible()) await dialog.getByRole("button", { name: "Cancel booking" }).press("Enter");
      await expect(page.getByText("This request is cancelled", { exact: true })).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  });
});
