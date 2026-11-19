import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The patient doctor-booking journey (docs/frontend/BOOKING_JOURNEY.md): discovery, profile, the seven-step
 * request wizard, the doctor's manual answer, reschedule, cancel and the receipt. Runs only against the
 * synthetic fixture adapter with the server started as FIXTURE_PATIENT_SESSION=self and a short
 * FIXTURE_PROVIDER_RESPONSE_MS. The shared synthetic store lives in the server process, so each test picks
 * its own day and time column and never depends on a fixed clock time.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
const DOCTOR_1 = { providerId: "00000000-0000-4000-8000-000000000001", serviceId: "00000000-0000-4000-8001-000000000001", name: "Synthetic doctor 1" };
const DOCTOR_2 = { providerId: "00000000-0000-4000-8000-000000000101", serviceId: "00000000-0000-4000-8001-000000000101", name: "Synthetic doctor 2" };
const PAID_BOOKING = "00000000-0000-4000-8000-000000000071";
const VISIT_NOTE = "Synthetic e2e note: mild fever for two days";

test.skip(!FIXTURE, "needs the synthetic fixture adapter");

async function expectAxeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map(v => `${label}: ${v.id} ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function expectFitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** Never put the note, address or other private draft values in the URL or browser storage. */
async function expectNoPrivateDraft(page: Page) {
  expect(decodeURIComponent(page.url())).not.toContain("fever");
  const leaked = await page.evaluate(marker => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes(marker))), "fever");
  expect(leaked).toBe(false);
}

async function expectStep(page: Page, current: number, title: string) {
  await expect(page.getByRole("group", { name: "Progress" }).filter({ visible: true })).toContainText(`Step ${current} of 7`);
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

/** Booking, payment and visit-record states are three separate badges. */
async function expectBadges(page: Page, booking: string, payment: string, record: string) {
  const list = page.getByLabel("Statuses");
  await expect(list.getByRole("definition").nth(0)).toHaveText(booking);
  await expect(list.getByRole("definition").nth(1)).toHaveText(payment);
  await expect(list.getByRole("definition").nth(2)).toHaveText(record);
}

const cont = (page: Page) => page.getByRole("button", { name: "Continue", exact: true });

/** Pick a day and a time by position; negative positions count from the end (`-1` is the last). */
async function pickSlot(scope: Locator, day: number, time: number) {
  const days = scope.getByRole("group", { name: "Day", exact: true }).locator("label");
  await expect(days.first()).toBeVisible();
  const dayCount = await days.count();
  await days.nth(Math.max(0, Math.min(day < 0 ? dayCount + day : day, dayCount - 1))).click();
  const times = scope.getByRole("group", { name: /^Time on / }).locator("label");
  const timeCount = await times.count();
  const chosen = times.nth(Math.max(0, Math.min(time < 0 ? timeCount + time : time, timeCount - 1)));
  await chosen.click();
  await expect(chosen.getByRole("radio")).toBeChecked();
}

/** Column per project so the two viewports never race for the same synthetic slot. */
const column = (projectName: string) => (projectName === "mobile-390" ? 0 : -1);

async function waitForAnswer(page: Page, title: string) {
  await expect(async () => {
    const refresh = page.getByRole("button", { name: "Check for updates" });
    await expect(refresh).toBeEnabled({ timeout: 15_000 });
    await refresh.click();
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

async function wizardThroughReview(page: Page, opts: { doctor: typeof DOCTOR_1; day: number; time: number; newAddress?: boolean; axe?: boolean; tag?: string }) {
  await expect(page.getByRole("heading", { level: 1, name: `Request a visit with ${opts.doctor.name}` })).toBeVisible();
  await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();

  await expectStep(page, 1, "Doctor and visit");
  await expect(page.getByText("Set by the doctor. The price is fixed when you send the request.")).toBeVisible();
  if (opts.axe) await expectAxeClean(page, "wizard/service");
  await cont(page).click();

  await expectStep(page, 2, "Who is the visit for?");
  await expect(page.getByRole("radio", { name: /Myself/ })).toBeChecked();
  await cont(page).click();
  await expect(page.getByText("Agree to share health details to continue.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /I agree to share these health details/ })).toBeFocused();
  await page.getByRole("checkbox", { name: /I agree to share these health details/ }).check();
  if (opts.axe) await expectAxeClean(page, "wizard/patient");
  await cont(page).click();

  await expectStep(page, 3, "Where should the doctor visit?");
  if (opts.newAddress) {
    // Every saved address is outside this doctor's area, so the patient adds one in the covered PIN.
    // The seeded saved addresses are outside this doctor's area. An address added by an earlier run in the
    // same server process may already be covered (the store is shared), so only assert the error without one.
    await expect(page.getByText("Outside this doctor's visit area").first()).toBeVisible();
    if (await page.getByRole("radio", { checked: true }).count() === 0) {
      await cont(page).click();
      await expect(page.getByText(/Choose an address in PIN \d{6}, or add one\./)).toBeVisible();
    }
    const locality = `Synthetic e2e colony ${opts.tag ?? ""}`.trim();
    await page.getByRole("button", { name: "Add a new address" }).click();
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByLabel("Area or locality")).toBeFocused();
    await page.getByLabel("Area or locality").fill(locality);
    await page.getByLabel("City", { exact: true }).fill("Hyderabad");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByRole("radio", { name: new RegExp(`${locality}, Hyderabad, PIN 500032`) }).last()).toBeChecked();
  } else {
    await expect(page.getByRole("radio", { name: /Synthetic locality, Synthetic city, PIN 500001/ })).toBeChecked();
  }
  if (opts.axe) await expectAxeClean(page, "wizard/location");
  await cont(page).click();

  await expectStep(page, 4, "Choose a time");
  await expect(page.getByText("Times are India time (IST). Each visit is booked for one hour.")).toBeVisible();
  await cont(page).click();
  await expect(page.getByText("Choose a time to continue.")).toBeVisible();
  await pickSlot(page.locator("main"), opts.day, opts.time);
  if (opts.axe) await expectAxeClean(page, "wizard/schedule");
  await cont(page).click();

  await expectStep(page, 5, "Anything the doctor should know?");
  await page.getByLabel(/Symptoms or reason for the visit/).fill(VISIT_NOTE);
  await expect(page.getByText(`${VISIT_NOTE.length} of 240 characters`)).toBeVisible();
  if (opts.axe) await expectAxeClean(page, "wizard/details");
  await cont(page).click();

  await expectStep(page, 6, "Fee and cancellation");
  await expect(page.getByRole("radio", { name: /Pay the doctor after the visit/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Pay online/ })).toBeDisabled();
  await cont(page).click();
  await expect(page.getByText("Accept the fee and the cancellation policy to continue.")).toBeVisible();
  await page.getByRole("checkbox", { name: "I accept the fee and the cancellation policy." }).check();
  if (opts.axe) await expectAxeClean(page, "wizard/paymentPolicy");
  await cont(page).click();

  await expectStep(page, 7, "Review and send");
  await expect(page.getByText(VISIT_NOTE)).toBeVisible();
  await expect(page.getByText("Sending a request does not book the visit yet. The doctor accepts or declines it.")).toBeVisible();
  await expectNoPrivateDraft(page);
  if (opts.axe) await expectAxeClean(page, "wizard/review");
  await expectFitsViewport(page);
}

/**
 * Send the reviewed request. If another run took the slot first (the store is shared), the app must send the
 * patient back to the time step with an explanation; the test then picks the next free time, like a patient would.
 */
async function send(page: Page, retime: { day: number; time: number }) {
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Confirm the details to send the request.")).toBeVisible();
  await page.getByRole("checkbox", { name: "These details are correct." }).check();
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Send request" }).click();
    const changed = page.getByText("That time is no longer available", { exact: true });
    // Either the request page opens (the "Request sent" notice is brief) or the time step explains the slot was taken.
    await expect(page.getByRole("heading", { level: 1, name: /^Visit with / }).or(changed).first()).toBeVisible({ timeout: 15_000 });
    if (!(await changed.isVisible())) break;
    await expectStep(page, 4, "Choose a time");
    await pickSlot(page.locator("main"), retime.day, retime.time === -1 ? -1 - attempt - 1 : attempt + 1);
    await cont(page).click();
    await cont(page).click();
    await page.getByRole("checkbox", { name: "I accept the fee and the cancellation policy." }).check();
    await cont(page).click();
    await expectStep(page, 7, "Review and send");
    await page.getByRole("checkbox", { name: "These details are correct." }).check();
  }
  await expect(page).toHaveURL(/\/en\/patient\/book\/[0-9a-f-]{36}$/, { timeout: 15_000 });
}

async function cancelRequest(page: Page) {
  await page.getByRole("button", { name: "Cancel request" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
  await expect(dialog.getByRole("button", { name: "Cancel booking" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "My plans changed" }).check();
  await dialog.getByRole("checkbox", { name: /I have read the cancellation terms/ }).check();
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("This request is cancelled", { exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe("booking journey", () => {
  test("happy path: search, profile, request, doctor accepts, reschedule, cancel", async ({ page }, info) => {
    test.setTimeout(120_000);
    const col = column(info.project.name);
    // Discovery and profile.
    await page.goto("/en/doctors");
    await expect(page.getByText("Synthetic data, not live").filter({ visible: true }).first()).toBeVisible();
    const card = page.getByTestId("doctor-card").filter({ hasText: DOCTOR_1.name });
    await card.getByRole("link", { name: "View profile" }).click();
    await expect(page.getByRole("heading", { level: 1, name: DOCTOR_1.name })).toBeVisible({ timeout: 20_000 });
    await expectAxeClean(page, "profile");
    await page.getByRole("link", { name: "Request a visit" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/patient/book\\?providerId=${DOCTOR_1.providerId}&serviceId=${DOCTOR_1.serviceId}$`));

    await wizardThroughReview(page, { doctor: DOCTOR_1, day: 1, time: col, axe: true });
    await send(page, { day: 1, time: col });

    // Pending: honest waiting state, no reference yet, nothing charged.
    await expect(page.getByRole("heading", { level: 1, name: `Visit with ${DOCTOR_1.name}` })).toBeVisible();
    // The doctor answers after FIXTURE_PROVIDER_RESPONSE_MS; on a loaded machine the first render can already show it.
    const waiting = page.getByText(`Waiting for ${DOCTOR_1.name} to answer`);
    await expect(waiting.or(page.getByText(`${DOCTOR_1.name} accepted your request`)).first()).toBeVisible({ timeout: 15_000 });
    if (await waiting.isVisible()) {
      await expect(page.getByText("You get a reference number when the doctor accepts.")).toBeVisible();
      await expectBadges(page, "Requested", "Not started", "No visit record yet");
      await expectAxeClean(page, "request/pending");
    }
    await expect(page.getByRole("link", { name: /receipt/i })).toHaveCount(0);

    // The synthetic doctor accepts; the server issues the reference.
    await waitForAnswer(page, `${DOCTOR_1.name} accepted your request`);
    await expect(page.getByText(/^Reference SCV-[0-9A-F]{6}$/)).toBeVisible();
    await expect(page.getByText("A receipt is issued after you pay the doctor.")).toBeVisible();
    await expectBadges(page, "Confirmed", "Payment due", "No visit record yet");
    await expectAxeClean(page, "request/confirmed");
    await expectFitsViewport(page);

    // Reschedule: the doctor must accept the new time again.
    await page.getByRole("button", { name: "Choose a new time" }).click();
    const reschedule = page.getByRole("region", { name: "Choose a new time" });
    await pickSlot(reschedule, 3, col);
    await expectAxeClean(page, "request/reschedule");
    await reschedule.getByRole("button", { name: "Send new time" }).click();
    await expect(page.getByText("New time sent. Waiting for the doctor to accept.")).toBeVisible();
    // The new time goes back to the doctor: the history shows a second request (the answer may already follow it).
    await expect(page.getByRole("region", { name: "History" }).getByText("Requested", { exact: true })).toHaveCount(2, { timeout: 15_000 });
    await waitForAnswer(page, `${DOCTOR_1.name} accepted your request`);

    await cancelRequest(page);
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expectAxeClean(page, "request/cancelled");
  });

  test("decline path: new covered address, doctor declines, patient is pointed elsewhere", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.goto(`/en/doctors/${DOCTOR_2.providerId}`);
    await page.getByRole("link", { name: "Request a visit" }).click();
    await wizardThroughReview(page, { doctor: DOCTOR_2, day: 0, time: column(info.project.name), newAddress: true, tag: `${info.project.name} ${Date.now()}` });
    await send(page, { day: 0, time: column(info.project.name) });
    await expect(page.getByText(`Waiting for ${DOCTOR_2.name} to answer`)).toBeVisible();
    await waitForAnswer(page, `${DOCTOR_2.name} could not take this request`);
    await expect(page.getByText("You have not been charged. Choose another doctor or time.")).toBeVisible();
    await expectBadges(page, "Declined", "Not started", "No visit record yet");
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choose a new time" })).toHaveCount(0);
    await expectAxeClean(page, "request/declined");
    await expectFitsViewport(page);
    await page.getByRole("link", { name: "Find another doctor" }).click();
    await expect(page).toHaveURL(/\/en\/doctors$/);
  });

  test("receipt for a paid visit is provider-issued and not a tax invoice", async ({ page }) => {
    await page.goto(`/en/patient/book/${PAID_BOOKING}`);
    await expect(page.getByText("Visit completed", { exact: true })).toBeVisible();
    await expectBadges(page, "Completed", "Paid", "Kept by the doctor");
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expectAxeClean(page, "request/completed");
    const link = page.getByRole("link", { name: "Open receipt (opens in a new tab)" });
    await expect(link).toHaveAttribute("href", `/en/patient/book/${PAID_BOOKING}/receipt`);
    const [receipt] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
    await expect(receipt).toHaveURL(new RegExp(`/en/patient/book/${PAID_BOOKING}/receipt$`));
    await expect(receipt.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(receipt.getByText("This receipt confirms payment to the doctor. It is not a tax invoice.")).toBeVisible();
    await expectAxeClean(receipt, "receipt");
    await expectFitsViewport(receipt);
  });

  test("wizard refuses to start without a doctor and for a fully booked doctor", async ({ page }) => {
    await page.goto("/en/patient/book");
    await expect(page.getByText("Choose a doctor first").filter({ visible: true })).toBeVisible();
    await page.goto("/en/patient/book?providerId=00000000-0000-4000-8000-000000000102&serviceId=00000000-0000-4000-8001-000000000102");
    await expect(page.getByText("This doctor cannot take requests right now").filter({ visible: true })).toBeVisible();
    await expect(cont(page)).toHaveCount(0);
  });
});

/** Press Tab until `target` has focus (fails if it is not reachable within `max` presses). */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test.describe("booking journey, keyboard only", () => {
  test("a request can be completed and cancelled without a pointer", async ({ page }, info) => {
    test.setTimeout(150_000);
    const last = info.project.name !== "mobile-390";
    await page.goto(`/en/doctors/${DOCTOR_1.providerId}`);
    await tabTo(page, page.getByRole("link", { name: "Request a visit" }));
    await page.keyboard.press("Enter");
    await expectStep(page, 1, "Doctor and visit");

    await tabTo(page, cont(page)); await page.keyboard.press("Enter");
    await expectStep(page, 2, "Who is the visit for?");
    await expect(page.getByRole("heading", { level: 2, name: "Who is the visit for?" })).toBeFocused();
    await tabTo(page, page.getByRole("checkbox", { name: /I agree to share these health details/ })); await page.keyboard.press("Space");
    await tabTo(page, cont(page)); await page.keyboard.press("Enter");

    await expectStep(page, 3, "Where should the doctor visit?");
    await tabTo(page, cont(page)); await page.keyboard.press("Enter");

    await expectStep(page, 4, "Choose a time");
    const dayGroup = page.getByRole("group", { name: "Day", exact: true });
    await tabTo(page, dayGroup.getByRole("radio").first());
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await expect(dayGroup.getByRole("radio").nth(2)).toBeChecked();
    const timeGroup = page.getByRole("group", { name: /^Time on / });
    await tabTo(page, timeGroup.getByRole("radio").first());
    await page.keyboard.press("Space");
    if (last) await page.keyboard.press("ArrowLeft");
    await expect(timeGroup.getByRole("radio", { checked: true })).toHaveCount(1);
    // Focus on a visually hidden radio must show on its pill.
    const outline = await timeGroup.locator("label").filter({ has: page.locator("input:focus-visible") }).evaluate(el => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await tabTo(page, cont(page)); await page.keyboard.press("Enter");

    await expectStep(page, 5, "Anything the doctor should know?");
    await tabTo(page, page.getByLabel(/Symptoms or reason for the visit/));
    await page.keyboard.type("Synthetic keyboard note");
    await tabTo(page, cont(page)); await page.keyboard.press("Enter");

    await expectStep(page, 6, "Fee and cancellation");
    await tabTo(page, page.getByRole("checkbox", { name: "I accept the fee and the cancellation policy." })); await page.keyboard.press("Space");
    await tabTo(page, cont(page)); await page.keyboard.press("Enter");

    await expectStep(page, 7, "Review and send");
    await tabTo(page, page.getByRole("checkbox", { name: "These details are correct." })); await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("button", { name: "Send request" })); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/patient\/book\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // Check for the doctor's answer from the keyboard, then cancel.
    const refresh = page.getByRole("button", { name: "Check for updates" });
    await expect(async () => {
      await expect(refresh).toBeEnabled({ timeout: 15_000 });
      await tabTo(page, refresh); await page.keyboard.press("Enter");
      await expect(page.getByText(`${DOCTOR_1.name} accepted your request`, { exact: true })).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    await expect(refresh).toBeEnabled({ timeout: 15_000 });
    await tabTo(page, page.getByRole("button", { name: "Cancel request" })); await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("radio").first()); await page.keyboard.press("Space");
    await tabTo(page, dialog.getByRole("checkbox", { name: /I have read the cancellation terms/ })); await page.keyboard.press("Space");
    await tabTo(page, dialog.getByRole("button", { name: "Cancel booking" })); await page.keyboard.press("Enter");
    await expect(page.getByText("This request is cancelled", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
