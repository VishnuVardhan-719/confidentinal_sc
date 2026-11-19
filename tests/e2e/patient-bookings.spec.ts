/**
 * fe-p: patient bookings list + detail against the synthetic fixture app.
 *
 * The interim patient session is a SERVER env var, so each mode needs its own server:
 *   session: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FIXTURE_BOOKING_SCENARIO=requested
 *   guest:   FRONTEND_ADAPTER=fixture APP_ENV=test (no FIXTURE_PATIENT_SESSION)
 * Run with E2E_FEP_MODE=session|guest and PLAYWRIGHT_BASE_URL pointing at that server. Without
 * E2E_FEP_MODE the suite is skipped (other agents' runs do not start this server).
 * Synthetic data only; the fixture booking id is not a real record.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Redirects, client navigations and server actions on a shared, often loaded machine; 5 s was flaky.
const expect = baseExpect.configure({ timeout: 15_000 });

const MODE = process.env.E2E_FEP_MODE;
const BOOKING = "00000000-0000-4000-8000-000000000061";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("patient bookings (signed-in synthetic patient)", () => {
  test.skip(MODE !== "session", "needs the session-mode fixture server");

  test("list shows the synthetic notice, filters, a booking row and separate badges", async ({ page }) => {
    await page.goto("/en/patient/bookings");
    await expect(page.getByRole("heading", { level: 1, name: "Your bookings" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Synthetic data, not live")).toBeVisible();
    const filters = page.getByRole("navigation", { name: "Filter bookings" });
    await expect(filters.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "View booking" }) });
    await expect(row).toHaveCount(1);
    const statuses = row.getByRole("definition");
    await expect(row.getByRole("term")).toHaveText(["Booking", "Payment", "Clinical record"]);
    await expect(statuses.first()).toHaveText("Requested");
    await expect(row).toContainText("₹500");
    await expectNoHorizontalScroll(page);
  });

  test("status filter is URL state and shows an honest empty state", async ({ page }) => {
    await page.goto("/en/patient/bookings");
    const filters = page.getByRole("navigation", { name: "Filter bookings" });
    await filters.getByRole("link", { name: /^Cancelled or declined/ }).click();
    await expect(page).toHaveURL(/\/en\/patient\/bookings\?status=cancelled$/);
    await expect(filters.getByRole("link", { name: /^Cancelled or declined/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "No bookings under Cancelled or declined on this page" })).toBeVisible();
    await page.getByRole("link", { name: "Show all on this page" }).click();
    await expect(page).toHaveURL(/\/en\/patient\/bookings$/);
    await expect(page.getByRole("link", { name: "View booking" })).toHaveCount(1);
  });

  test("malformed query values are ignored", async ({ page }) => {
    await page.goto("/en/patient/bookings?status=PAID&cursor=1%20OR%201%3D1");
    await expect(page.getByRole("navigation", { name: "Filter bookings" }).getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "View booking" })).toHaveCount(1);
  });

  test("detail keeps booking, payment, clinical and provider decision separate", async ({ page }) => {
    await page.goto("/en/patient/bookings");
    await page.getByRole("link", { name: "View booking" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/patient/bookings/${BOOKING}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Doctor visit" })).toBeVisible();
    const status = page.getByRole("region", { name: "Status" });
    await expect(status.getByRole("term")).toHaveText(["Booking", "Payment", "Clinical record"]);
    await expect(status.getByRole("definition").first()).toHaveText("Requested");
    await expect(status).toContainText("Waiting for the provider");
    await expect(status).toContainText("Only the provider can accept or decline.");
    await expect(page.getByRole("button", { name: /^(Accept|Decline)/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Fee" })).toContainText("₹500");
    await expect(page.getByRole("region", { name: "Visit" })).toContainText("India time (IST)");
    await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("cancel needs explicit acknowledgement and reports the server result", async ({ page }) => {
    await page.goto(`/en/patient/bookings/${BOOKING}`);
    const trigger = page.getByRole("button", { name: "Cancel this booking" });
    const dialog = page.getByRole("alertdialog", { name: "Cancel this booking?" });
    await trigger.click();
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Yes, cancel booking" });
    await expect(confirm).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel this booking" })).toBeFocused();
    await page.getByRole("button", { name: "Cancel this booking" }).click();
    await dialog.getByRole("checkbox", { name: "I understand this cannot be undone." }).check();
    await confirm.click();
    await expect(page.getByText("Cancellation sent")).toBeVisible();
  });

  test("reschedule is clearly gated and nothing is sent", async ({ page }) => {
    await page.goto(`/en/patient/bookings/${BOOKING}`);
    await expect(page.getByRole("main").getByText("Rescheduling is not available yet")).toBeVisible();
    await page.getByRole("button", { name: "Request new time" }).click();
    await expect(page.getByText("Enter a valid date.")).toBeVisible();
    await page.getByLabel("Preferred date").fill("2000-01-15");
    await page.getByLabel("Preferred time").fill("10:30");
    await page.getByRole("button", { name: "Request new time" }).click();
    await expect(page.getByText("Choose a time in the future.")).toBeVisible();
    await page.getByLabel("Preferred date").fill("2099-01-15");
    await page.getByLabel("Preferred time").fill("10:30");
    await page.getByRole("button", { name: "Request new time" }).click();
    await expect(page.getByText("Not sent", { exact: true })).toBeVisible();
    await expect(page.getByText("Rescheduling is not connected yet. Your booking has not changed.")).toBeVisible();
  });

  test("an unknown or malformed id shows a privacy-safe not-available state", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8000-000000000099", "not-a-booking"]) {
      await page.goto(`/en/patient/bookings/${id}`);
      // Scoped to main: while the response streams, React briefly holds a hidden copy outside main.
      await expect(page.getByRole("main").getByText("This booking is not available. It may not exist, or it is not on your account.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel this booking" })).toHaveCount(0);
    }
  });

  test("te and hi render without raw message keys", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      await page.goto(`/${locale}/patient/bookings/${BOOKING}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main")).not.toContainText(/patient\.(booking|bookings|dashboard)\./);
    }
  });

  test("nav links to the dashboard, profile and health profile", async ({ page, isMobile }) => {
    await page.goto("/en/patient/bookings");
    if (isMobile || (page.viewportSize()?.width ?? 1280) < 1024) {
      const menu = page.getByRole("button", { name: "Open menu" });
      // Retry until hydrated: a click before hydration does not open the sheet.
      await expect(async () => {
        if (!(await page.getByRole("dialog").isVisible())) await menu.click();
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
      }).toPass();
    }
    for (const [name, href] of [["Overview", "/en/patient/dashboard"], ["Profile", "/en/patient/profile"], ["Health profile", "/en/patient/health-profile"]]) {
      await expect(page.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", href);
    }
  });
});

test.describe("patient bookings (guest)", () => {
  test.skip(MODE !== "guest", "needs the guest-mode fixture server");

  test("private URLs redirect to login with a safe locale-aware return path", async ({ page }) => {
    for (const [path, next] of [
      [`/hi/patient/bookings/${BOOKING}`, `/hi/patient/bookings/${BOOKING}`],
      ["/te/patient/bookings?status=past", "/te/patient/bookings"],
      ["/en/patient/bookings/not-a-booking", "/en/patient/bookings"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/(en|te|hi)\/login\?/);
      const location = new URL(page.url());
      expect(location.pathname).toBe(`/${next.split("/")[1]}/login`);
      expect(location.searchParams.get("next")).toBe(next);
      await expect(page.getByText("Synthetic data, not live")).toHaveCount(0);
    }
  });
});
