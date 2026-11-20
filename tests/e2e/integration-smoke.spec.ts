import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { FIXTURE_IDS } from "../../src/fixtures/clinical/world";
import { ambulanceFixtures } from "../../src/fixtures/operations/ambulance";
import { ACCOUNTS, signIn } from "./support/identity";
import { PERSONA_EMAILS } from "./support/operations";

/**
 * Integration smoke (fe-int2): every area of the merged app renders behind the real fe-b guards
 * at 390px and 1280px, with no error boundary, no horizontal scroll and no axe WCAG 2.1 A/AA
 * violations. SYNTHETIC fixture accounts only (@example.invalid).
 * The area pass is read-only. The "mutation flows" block at the end (INT3) changes the in-memory
 * synthetic world of the server: booking request + cancel, provider accept/decline, CMS publish,
 * with axe run while each dialog is open. Start a fresh server for every full run.
 * Config: tests/e2e/integration.config.ts (server on :3320).
 */

type Area = { name: string; email: string | null; routes: string[] };

const AREAS: Area[] = [
  { name: "public", email: null, routes: ["/en", "/te", "/hi", "/en/doctors", "/en/how-it-works", "/en/faq", "/en/stories", "/en/emergency", "/en/lab-tests", "/en/login", "/en/signup"] },
  {
    name: "patient",
    email: ACCOUNTS.patientComplete,
    routes: ["/en/patient/dashboard", "/en/patient/bookings", "/en/patient/book", "/en/patient/records", "/en/patient/notifications", "/en/patient/family", "/en/patient/lab-tests", "/en/patient/profile", "/en/patient/reviews", "/te/patient/dashboard"],
  },
  { name: "doctor", email: ACCOUNTS.doctorActive, routes: ["/en/doctor/dashboard", "/en/doctor/requests", "/en/doctor/visits", "/en/doctor/availability", "/en/doctor/profile", "/en/doctor/reviews"] },
  { name: "lab", email: PERSONA_EMAILS.labManager, routes: ["/en/lab/dashboard", "/en/lab/orders", "/en/lab/collections"] },
  { name: "ambulance", email: PERSONA_EMAILS.ambulanceOperator, routes: ["/en/ambulance/dashboard", "/en/ambulance/requests", "/en/ambulance/fleet"] },
  { name: "caretaker", email: PERSONA_EMAILS.agencyManager, routes: ["/en/caretaker/dashboard", "/en/caretaker/requests", "/en/caretaker/shifts"] },
  { name: "admin", email: PERSONA_EMAILS.adminLead, routes: ["/en/admin/dashboard", "/en/admin/providers", "/en/admin/bookings", "/en/admin/cms", "/en/admin/reviews", "/en/admin/reviews/log"] },
];

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

// ---------------------------------------------------------------------------------------------
// INT3 mutation flows. Each viewport project uses its own synthetic slot, record or CMS entry where
// the fixture world allows it; the single pending doctor request is answered by whichever project
// reaches it first (the other checks that it can no longer be answered).

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const DOCTOR_1 = { providerId: "00000000-0000-4000-8000-000000000001", serviceId: "00000000-0000-4000-8001-000000000001", name: "Synthetic doctor 1" };
const [AMB_STALE, AMB_FRESH] = ambulanceFixtures.requests;

/** Axe over the whole page; with a modal open this checks the dialog and that the rest is hidden correctly. */
async function expectAxe(page: Page, label: string) {
  const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const violations = axe.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  test.info().annotations.push({ type: "axe", description: `${label}: ${violations.length ? violations.join("; ") : "none"}` });
  expect(violations, `axe violations (${label})`).toEqual([]);
}

/** Opens a dialog from its trigger, retrying until hydration has wired the click handler. */
async function openDialog(page: Page, trigger: Locator, role: "dialog" | "alertdialog" = "alertdialog"): Promise<Locator> {
  const dialog = page.getByRole(role);
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

const visible = (l: Locator) => l.filter({ visible: true });
const isMobile = (name: string) => name === "mobile-390";

async function signedInPage(browser: Browser, email: string, use: { viewport: { width: number; height: number } | null; baseURL?: string }) {
  const context = await contextFor(browser, email, use);
  return { context, page: await context.newPage() };
}

test.describe("mutation flows", () => {
  test("patient sends a booking request, the synthetic doctor accepts, the patient cancels (dialog axe)", async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page } = await signedInPage(browser, ACCOUNTS.patientComplete, info.project.use as never);
    const cont = () => page.getByRole("button", { name: "Continue", exact: true });
    await page.goto(`/en/patient/book?providerId=${DOCTOR_1.providerId}&serviceId=${DOCTOR_1.serviceId}`);
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: `Request a visit with ${DOCTOR_1.name}` })).toBeVisible();
    await cont().click(); // 1 service
    await page.getByRole("checkbox", { name: /I agree to share these health details/ }).check();
    await cont().click(); // 2 patient
    await expect(page.getByRole("radio", { name: /PIN 500001/ }).first()).toBeChecked();
    await cont().click(); // 3 location

    // 4 schedule: day 2, first time on mobile and last time on desktop; on a taken slot try the next one.
    const pick = async (offset: number) => {
      const days = page.getByRole("group", { name: "Day", exact: true }).locator("label");
      await expect(days.first()).toBeVisible();
      await days.nth(Math.min(2, (await days.count()) - 1)).click();
      const times = page.getByRole("group", { name: /^Time on / }).locator("label");
      const n = await times.count();
      const index = isMobile(info.project.name) ? Math.min(offset, n - 1) : Math.max(0, n - 1 - offset);
      await times.nth(index).click();
      await expect(times.nth(index).getByRole("radio")).toBeChecked();
    };
    await pick(0);
    await cont().click();
    await page.getByLabel(/Symptoms or reason for the visit/).fill("Synthetic integration smoke note");
    await cont().click(); // 5 details
    await expect(page.getByRole("radio", { name: /Pay the doctor after the visit/ })).toBeChecked();
    await page.getByRole("checkbox", { name: "I accept the fee and the cancellation policy." }).check();
    await cont().click(); // 6 fee and policy
    await expect(page.getByRole("heading", { level: 2, name: "Review and send" })).toBeVisible();
    await expectAxe(page, "wizard/review");
    await page.getByRole("checkbox", { name: "These details are correct." }).check();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.getByRole("button", { name: "Send request" }).click();
      const taken = page.getByText("That time is no longer available", { exact: true });
      await expect(page.getByRole("heading", { level: 1, name: /^Visit with / }).or(taken).first()).toBeVisible({ timeout: 20_000 });
      if (!(await taken.isVisible())) break;
      await pick(attempt);
      await cont().click();
      await cont().click();
      await page.getByRole("checkbox", { name: "I accept the fee and the cancellation policy." }).check();
      await cont().click();
      await page.getByRole("checkbox", { name: "These details are correct." }).check();
    }
    await expect(page).toHaveURL(/\/en\/patient\/book\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    // The server-made booking id is in the path; the note never is.
    expect(decodeURIComponent(page.url())).not.toContain("smoke note");

    // The synthetic doctor answers FIXTURE_PROVIDER_RESPONSE_MS (default 3 s) later; the page refreshes on request.
    const accepted = page.getByText(`${DOCTOR_1.name} accepted your request`, { exact: true });
    await expect(async () => {
      if (await accepted.isVisible()) return;
      const refresh = page.getByRole("button", { name: "Check for updates" });
      await expect(refresh).toBeEnabled({ timeout: 15_000 });
      await refresh.click();
      await expect(accepted).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByText(/^Reference SCV-[0-9A-F]{6}$/)).toBeVisible();

    const dialog = await openDialog(page, page.getByRole("button", { name: "Cancel request" }));
    await expect(dialog).toHaveAccessibleName("Cancel this booking?");
    await expect(dialog.getByRole("button", { name: "Cancel booking" })).toBeDisabled();
    await expectAxe(page, "cancel dialog");
    await dialog.getByRole("radio", { name: "My plans changed" }).check();
    await dialog.getByRole("checkbox", { name: /I have read the cancellation terms/ }).check();
    await dialog.getByRole("button", { name: "Cancel booking" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("This request is cancelled", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
    await expectAxe(page, "request/cancelled");
    await context.close();
  });

  test("doctor: decline needs a reason, accept moves the request to a visit (dialog axe)", async ({ browser }, info) => {
    test.setTimeout(90_000);
    const { context, page } = await signedInPage(browser, ACCOUNTS.multiRole, info.project.use as never);
    const request = `/en/doctor/requests/${FIXTURE_IDS.bookingRequest}`;
    const visit = new RegExp(`/en/doctor/visits/${FIXTURE_IDS.bookingRequest}$`);
    await page.goto(request);
    await settle(page);
    const acceptTrigger = page.getByRole("button", { name: "Accept request" });
    if ((await acceptTrigger.count()) === 0) {
      // The other viewport project accepted the only pending synthetic request first.
      test.info().annotations.push({ type: "note", description: "request already answered by the other project; checked it cannot be answered again" });
      await expect(page.getByRole("button", { name: "Decline request" })).toHaveCount(0);
      await page.goto(`/en/doctor/visits/${FIXTURE_IDS.bookingRequest}`);
      await expect(page).toHaveURL(visit);
      await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
      await context.close();
      return;
    }
    const decline = await openDialog(page, page.getByRole("button", { name: "Decline request" }));
    await decline.getByRole("button", { name: "Decline request" }).click();
    await expect(decline).toContainText(/choose a reason to decline/i);
    await expectAxe(page, "doctor decline dialog (reason error)");
    await page.keyboard.press("Escape");
    await expect(decline).toBeHidden();
    const accept = await openDialog(page, acceptTrigger);
    await expectAxe(page, "doctor accept dialog");
    await accept.getByRole("button", { name: "Accept request" }).click();
    await expect(page).toHaveURL(visit, { timeout: 15_000 });
    await settle(page);
    await expect(page.locator("body")).not.toContainText(ERROR_TEXT);
    await context.close();
  });

  test("ambulance operator: decline with a reason (mobile) or accept with vehicle and driver (desktop), dialog axe", async ({ browser }, info) => {
    test.setTimeout(90_000);
    const { context, page } = await signedInPage(browser, PERSONA_EMAILS.ambulanceOperator, info.project.use as never);
    await page.goto("/en/ambulance/requests");
    await settle(page);
    const row = (reference: string) => visible(page.locator("tr, ul[aria-label] > li").filter({ hasText: reference }));
    const toast = page.getByRole("region", { name: /notifications/i });
    if (isMobile(info.project.name)) {
      const stale = row(AMB_STALE.reference);
      const dialog = await openDialog(page, stale.getByRole("button", { name: /^decline$/i }));
      await dialog.getByRole("button", { name: /^decline$/i }).click();
      await expect(dialog.getByText(/select a reason to continue/i)).toBeVisible();
      await expectAxe(page, "ambulance decline dialog (reason error)");
      await dialog.getByLabel("Reason").selectOption({ index: 1 });
      await dialog.getByRole("button", { name: /^decline$/i }).click();
      await expect(toast).toContainText("Declined. The list has been updated.", { timeout: 15_000 });
      await expect(row(AMB_STALE.reference).getByRole("button", { name: /^decline$/i })).toHaveCount(0, { timeout: 15_000 });
    } else {
      const fresh = row(AMB_FRESH.reference);
      const dialog = await openDialog(page, fresh.getByRole("button", { name: /^accept$/i }), "dialog");
      await expect(dialog).toHaveAccessibleName(`Accept ${AMB_FRESH.reference}`);
      await expectAxe(page, "ambulance accept dialog");
      await dialog.getByLabel("Vehicle").selectOption({ index: 1 });
      await dialog.getByLabel("Driver").selectOption({ index: 1 });
      await dialog.getByRole("button", { name: "Accept and assign" }).click();
      await expect(toast).toContainText("Accepted. The trip has been scheduled.", { timeout: 15_000 });
    }
    await expect(page.locator("body")).not.toContainText(ERROR_TEXT);
    await expectAxe(page, "ambulance requests after decision");
    await context.close();
  });

  test("admin publishes a new FAQ; the public FAQ shows it (publish dialog axe)", async ({ browser }, info) => {
    test.setTimeout(90_000);
    const { context, page } = await signedInPage(browser, PERSONA_EMAILS.adminLead, info.project.use as never);
    const slug = `int3-smoke-${info.project.name}`;
    const question = `Synthetic integration question ${info.project.name}`;
    await page.goto("/en/admin/cms/new?kind=faq");
    await settle(page);
    await page.getByLabel(/address name|slug/i).fill(slug);
    await page.getByLabel(/^question/i).fill(question);
    await page.getByLabel(/^answer/i).fill("Synthetic integration answer with **bold** text.");
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByRole("region", { name: /notifications/i })).toContainText(/saved/i, { timeout: 15_000 });
    await page.getByRole("button", { name: /send to preview|submit for preview/i }).click();
    await expect(visible(page.getByText(/in preview/i)).first()).toBeVisible({ timeout: 15_000 });
    const dialog = await openDialog(page, page.getByRole("button", { name: /^publish$/i }));
    await expectAxe(page, "CMS publish dialog");
    await dialog.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByRole("list", { name: /revision history/i }).getByRole("listitem").first()).toContainText(/published/i, { timeout: 15_000 });
    await page.goto("/en/faq");
    await settle(page);
    await expect(page.getByText(question)).toBeVisible();
    // Answers sit in a closed <details>; open this question and check the safe Markdown rendering.
    const item = page.locator("details").filter({ hasText: question });
    await item.locator("summary").click();
    await expect(item.locator("strong", { hasText: "bold" })).toBeVisible();
    await context.close();
  });
});
