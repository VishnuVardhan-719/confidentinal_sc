import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { patientTest as test } from "./support/fixture-session";

/**
 * Patient lab tests, caretaker and scheduled ambulance requests (PHASE-R6-C). Synthetic fixture adapter only,
 * signed in as the synthetic patient (support/fixture-session.ts) and a server started with a short FIXTURE_PROVIDER_RESPONSE_MS. The request
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
    await expect(page.getByText("Enter a known locality or a 6-digit PIN code that does not start with 0.").filter({ visible: true }).first()).toBeVisible();
    await page.getByLabel("PIN code").fill("500081");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/pin=500081$/);
    await expect(page.getByText("1 provider serving PIN 500081").filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId("service-provider-card").filter({ visible: true })).toHaveText(/Synthetic lab 3/);
    await page.goto("/en/patient/lab-tests?pin=600001");
    await expect(page.getByText("No providers serve this PIN yet").filter({ visible: true }).first()).toBeVisible();
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

test.describe("caretakers", () => {
  test("discover: providers show kind, languages, help and hours; PIN filter", async ({ page }) => {
    await page.goto("/en/patient/caretakers");
    await expect(page.getByRole("heading", { level: 1, name: "Caretakers at home" })).toBeVisible();
    await expect(page.getByTestId("service-provider-card")).toHaveCount(3);
    await expect(page.getByTestId("service-provider-card").first()).toContainText("Independent caretaker");
    await expect(page.getByTestId("service-provider-card").first()).toContainText("₹500.00");
    await page.getByLabel("PIN code").fill("500032");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("1 provider serving PIN 500032").filter({ visible: true })).toBeVisible();
    await expectAxeClean(page, "care/list");
    await expectFitsViewport(page);
  });

  test("happy path: one non-clinical shift, caretaker accepts, patient cancels", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/caretakers");
    await page.getByRole("link", { name: "Request care: Synthetic caretaker 1" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Request care from Synthetic caretaker 1" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/They do not give medical treatment, injections or medicines/).first()).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Help with bathing/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Send request" }).click();
    const summary = page.getByRole("alert").filter({ hasText: /problem/ });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Choose at least one kind of help.");
    await expect(summary).toContainText("Choose how many hours.");
    await expect(summary).toContainText("Confirm you understand caretakers give non-clinical help only.");
    await page.getByRole("checkbox", { name: "Company and conversation" }).check();
    await page.getByRole("checkbox", { name: /Reminders to take medicines/ }).check();
    await page.getByLabel("How many hours?").selectOption("3");
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 1, col);
    await page.getByRole("checkbox", { name: "I understand caretakers give non-clinical help only." }).check();
    await page.getByLabel(/Anything the provider should know/).fill(NOTE);
    await expect(page.getByTestId("request-price")).toContainText("Care hours");
    await expect(page.getByTestId("request-price")).toContainText("₹750.00");
    await expect(page.getByText(/Regular or repeating care plans are not available yet/)).toBeVisible();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    await expectNoPrivateDraft(page);
    await expectAxeClean(page, "care/form");
    await expectFitsViewport(page);
    await sendWithRetry(page, timeGroup, { day: 1, time: col });
    await expect(page).toHaveURL(/\/en\/patient\/caretakers\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Home care with Synthetic caretaker 1" })).toBeVisible();
    await waitForAnswer(page, "Synthetic caretaker 1 accepted your request");
    await expectBadges(page, "Confirmed", "Payment due", "Non-clinical, no medical record");
    await expect(page.getByRole("region", { name: "Request details" })).toContainText("3 hours");
    await expect(page.getByText("Company and conversation, Reminders to take medicines (reminding only)")).toBeVisible();
    await expectAxeClean(page, "care/confirmed");
    await expectFitsViewport(page);
    await cancelRequest(page);
    await expectBadges(page, "Cancelled", "Not started", "Non-clinical, no medical record");
  });

  test("decline path: the agency declines and nothing is due", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/caretakers/request?providerId=00000000-0000-4000-8300-000000000002");
    await expect(page.getByRole("heading", { level: 1, name: "Request care from Synthetic care agency 2" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("checkbox", { name: /Help with bathing/ }).check();
    await page.getByLabel("How many hours?").selectOption("4");
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 0, col);
    await page.getByRole("checkbox", { name: "I understand caretakers give non-clinical help only." }).check();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    await sendWithRetry(page, timeGroup, { day: 0, time: col });
    await waitForAnswer(page, "Synthetic care agency 2 could not take this request");
    await expectBadges(page, "Declined", "Not started", "Non-clinical, no medical record");
    await expect(page.getByRole("complementary", { name: "Price" })).toContainText("₹0.00");
    await expectAxeClean(page, "care/declined");
  });

  test("keyboard only: request a care shift without a pointer", async ({ page }, info) => {
    test.setTimeout(150_000);
    const last = info.project.name !== "mobile-390";
    await page.goto("/en/patient/caretakers/request?providerId=00000000-0000-4000-8300-000000000001");
    await expect(page.getByRole("heading", { level: 1, name: "Request care from Synthetic caretaker 1" })).toBeVisible({ timeout: 20_000 });
    await tabTo(page, page.getByRole("checkbox", { name: "Help with meals" })); await page.keyboard.press("Space");
    await tabTo(page, page.getByLabel("How many hours?"));
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await expect(page.getByLabel("How many hours?")).not.toHaveValue("");
    const dayGroup = page.getByRole("group", { name: "Day", exact: true });
    await tabTo(page, dayGroup.getByRole("radio").first());
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    const timeGroup = page.getByRole("group", { name: /^Time on / });
    await tabTo(page, timeGroup.getByRole("radio").first()); await page.keyboard.press("Space");
    if (last) await page.keyboard.press("ArrowLeft");
    await tabTo(page, page.getByRole("checkbox", { name: "I understand caretakers give non-clinical help only." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("button", { name: "Send request" })); await page.keyboard.press("Enter");
    // If another run took this time, the form says so and keeps the answers: choose the next time by keyboard and send again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const changed = page.getByText("Something changed", { exact: true });
      await expect(page.getByRole("heading", { level: 1, name: /^Home care with/ }).or(changed).first()).toBeVisible({ timeout: 20_000 });
      if (!(await changed.isVisible())) break;
      await tabTo(page, timeGroup.getByRole("radio", { checked: true }).or(timeGroup.getByRole("radio").first()).first());
      await page.keyboard.press("ArrowRight");
      await tabTo(page, page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." })); await page.keyboard.press("Space");
      await tabTo(page, page.getByRole("button", { name: "Send request" })); await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(/\/en\/patient\/caretakers\/requests\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ambulance transfer", () => {
  test("every ambulance page leads with the 108 emergency notice", async ({ page }) => {
    await page.goto("/en/patient/ambulance");
    const banner = page.getByTestId("emergency-banner");
    await expect(banner).toContainText("Emergency? Call 108 now");
    await expect(banner.getByRole("link", { name: "Call 108" })).toHaveAttribute("href", "tel:108");
    // It is the first notice in the main content, above the synthetic-data notice.
    const firstNotice = page.locator("main [data-testid='emergency-banner'], main [data-fixture-notice]").first();
    await expect(firstNotice).toHaveAttribute("data-testid", "emergency-banner");
    await expect(page.getByRole("heading", { level: 1, name: "Scheduled ambulance transfer" })).toBeVisible();
    await expect(page.getByText(/\bETA\b|\bon the way\b|\barriving\b/i)).toHaveCount(0);
    await expectAxeClean(page, "amb/list");
    await expectFitsViewport(page);
    await page.goto("/en/patient/ambulance/request?providerId=00000000-0000-4000-8400-000000000001");
    await expect(page.getByTestId("emergency-banner").filter({ visible: true })).toBeVisible();
  });

  test("happy path: scheduled transfer, operator accepts, patient cancels", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/ambulance");
    await page.getByRole("link", { name: "Request transfer: Synthetic transfer operator 1" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Request a transfer from Synthetic transfer operator 1" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Send request" }).click();
    const summary = page.getByRole("alert").filter({ hasText: /problem/ });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Confirm this is not an emergency. For emergencies call 108.");
    await expect(summary).toContainText("Choose how the patient moves.");
    await page.getByRole("radio", { name: "Needs a stretcher" }).check();
    await expect(page.getByRole("radio", { name: /Wheelchair van/ })).toBeDisabled();
    await page.getByRole("radio", { name: /Patient transport with stretcher/ }).check();
    await expect(page.getByRole("radio", { name: /Home: Synthetic locality, Synthetic city, PIN 500001/ })).toBeChecked();
    const drop = page.getByRole("group", { name: "Drop-off" });
    await drop.getByRole("radio", { name: "Hospital or clinic" }).check();
    await drop.getByLabel("Name of the place (optional)").fill("Synthetic general hospital");
    await drop.getByLabel("Area or locality").fill("Synthetic locality B");
    await drop.getByLabel("City").fill("Hyderabad");
    await drop.getByLabel("PIN code").fill("500081");
    await page.getByRole("checkbox", { name: "Someone will travel with the patient" }).check();
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 1, col);
    await page.getByRole("checkbox", { name: "I confirm this is a planned transfer, not an emergency." }).check();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    // A drop-off outside the operator's area is caught before sending.
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /problem/ })).toContainText("Enter the drop-off area, city and a 6-digit PIN in this operator's area.");
    await drop.getByLabel("PIN code").fill("500032");
    await expect(page.getByTestId("request-price")).toContainText("Scheduled transfer: Patient transport with stretcher");
    await expect(page.getByTestId("request-price")).toContainText("₹1,200.00");
    await expectAxeClean(page, "amb/form");
    await expectFitsViewport(page);
    await sendWithRetry(page, timeGroup, { day: 1, time: col });
    await expect(page).toHaveURL(/\/en\/patient\/ambulance\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("emergency-banner").filter({ visible: true })).toBeVisible();
    await waitForAnswer(page, "Synthetic transfer operator 1 accepted your request");
    await expectBadges(page, "Confirmed", "Payment due", "No clinical record");
    const details = page.getByRole("region", { name: "Request details" });
    await expect(details).toContainText("Needs a stretcher");
    await expect(details).toContainText("Hospital or clinic: Synthetic general hospital, Synthetic locality B, Hyderabad, PIN 500032");
    await expect(page.getByText(/\bETA\b|\bon the way\b|\barriving\b/i)).toHaveCount(0);
    await expectAxeClean(page, "amb/confirmed");
    await cancelRequest(page);
    await expectBadges(page, "Cancelled", "Not started", "No clinical record");
  });

  test("decline path: the operator declines", async ({ page }, info) => {
    test.setTimeout(150_000);
    const col = column(info.project.name);
    await page.goto("/en/patient/ambulance/request?providerId=00000000-0000-4000-8400-000000000002");
    await expect(page.getByRole("heading", { level: 1, name: "Request a transfer from Synthetic transfer operator 2" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("radio", { name: "Walks without help" }).check();
    await page.getByRole("radio", { name: /Patient transport with stretcher/ }).check();
    const drop = page.getByRole("group", { name: "Drop-off" });
    await drop.getByRole("radio", { name: "Home" }).check();
    await drop.getByLabel("Area or locality").fill("Synthetic locality D");
    await drop.getByLabel("City").fill("Secunderabad");
    await drop.getByLabel("PIN code").fill("500003");
    const timeGroup = page.getByRole("group", { name: "Date and time" });
    await pickSlot(timeGroup, 0, col);
    await page.getByRole("checkbox", { name: "I confirm this is a planned transfer, not an emergency." }).check();
    await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
    await sendWithRetry(page, timeGroup, { day: 0, time: col });
    await waitForAnswer(page, "Synthetic transfer operator 2 could not take this request");
    await expectBadges(page, "Declined", "Not started", "No clinical record");
    await expect(page.getByTestId("emergency-banner").filter({ visible: true })).toBeVisible();
    await expectAxeClean(page, "amb/declined");
  });

  test("keyboard only: the 108 call link and the form are reachable without a pointer", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/en/patient/ambulance/request?providerId=00000000-0000-4000-8400-000000000001");
    await expect(page.getByRole("heading", { level: 1, name: /Request a transfer/ })).toBeVisible({ timeout: 20_000 });
    await tabTo(page, page.getByRole("link", { name: "Call 108" }));
    // Native radio groups: Tab enters the group, arrow keys choose within it.
    await tabTo(page, page.getByRole("radio", { name: "Walks without help" }));
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Uses a wheelchair" })).toBeChecked();
    await tabTo(page, page.getByRole("radio", { name: /Patient transport with stretcher/ }));
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /Wheelchair van/ })).toBeChecked();
    await tabTo(page, page.getByRole("group", { name: "Drop-off" }).getByLabel("Area or locality")); await page.keyboard.type("Synthetic locality B");
    await page.keyboard.press("Tab"); await page.keyboard.type("Hyderabad");
    await page.keyboard.press("Tab"); await page.keyboard.type("500032");
    const timeGroup = page.getByRole("group", { name: /^Time on / });
    await tabTo(page, timeGroup.getByRole("radio").first()); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("checkbox", { name: "I confirm this is a planned transfer, not an emergency." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." })); await page.keyboard.press("Space");
    await expect(page.getByTestId("request-price")).toContainText("₹900.00");
    await tabTo(page, page.getByRole("button", { name: "Send request" })); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: /Scheduled transfer with/ }).or(page.getByText("Something changed", { exact: true })).first()).toBeVisible({ timeout: 20_000 });
  });
});
