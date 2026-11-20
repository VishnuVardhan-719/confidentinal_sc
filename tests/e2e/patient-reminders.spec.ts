/**
 * fe-p R7: reminder preferences (channels, quiet hours in IST). One synthetic preferences record is
 * shared by every test on the server, so saves retry once on a version conflict caused by a parallel
 * project, and the conflict UI is tested on purpose with two tabs. Synthetic data only.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const MODE = process.env.E2E_FEP_MODE;
const PATH = "/en/patient/settings/reminders";

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

/** Apply `edit` and save; if another project saved in between, reload and apply again (once). */
async function saveWith(page: Page, edit: (main: ReturnType<Page["getByRole"]>) => Promise<void>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(PATH);
    const main = page.getByRole("main");
    await edit(main);
    await main.getByRole("button", { name: "Save preferences" }).click();
    const done = main.getByText("Preferences saved.");
    const conflict = main.getByText("These preferences changed in another window.", { exact: false });
    await expect(done.or(conflict)).toBeVisible();
    if (await done.isVisible()) return;
  }
  throw new Error("save kept conflicting");
}

test.describe("reminder preferences (signed-in)", () => {
  test.skip(MODE !== "session", "needs a session fixture server");

  test("shows channels and quiet hours with IST guidance; axe clean", async ({ page }) => {
    await page.goto(PATH);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Reminder preferences" })).toBeVisible();
    await expect(main.getByRole("group", { name: "Send visit reminders by" }).getByRole("checkbox")).toHaveCount(3);
    await expect(main.getByText("Times are India time (IST).", { exact: false })).toBeVisible();
    await expect(main.getByText(/Last saved/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("validation: same start and end, then an overnight window saves and persists", async ({ page, isMobile }) => {
    await page.goto(PATH);
    const main = page.getByRole("main");
    const quiet = main.getByRole("checkbox", { name: "Do not send reminders during quiet hours" });
    if (!(await quiet.isChecked())) await quiet.check();
    await main.getByLabel("Quiet from").fill("07:00");
    await main.getByLabel("Quiet until").fill("07:00");
    await main.getByRole("button", { name: "Save preferences" }).click();
    const summary = main.getByRole("alert").filter({ hasText: "Start and end cannot be the same time." });
    await expect(summary).toBeFocused();
    await summary.getByRole("link").click();
    await expect(main.getByLabel("Quiet until")).toBeFocused();

    const [start, end] = isMobile || (page.viewportSize()?.width ?? 1280) < 1024 ? ["22:15", "06:45"] : ["23:00", "05:30"];
    await saveWith(page, async (m) => {
      const q = m.getByRole("checkbox", { name: "Do not send reminders during quiet hours" });
      if (!(await q.isChecked())) await q.check();
      await m.getByLabel("Quiet from").fill(start);
      await m.getByLabel("Quiet until").fill(end);
      await expect(m.getByText(`No reminders from ${start} to ${end} IST.`)).toBeVisible();
      await expect(m.getByText("This runs overnight into the next morning.")).toBeVisible();
    });
    await page.reload();
    // Another project may have saved its own window since; either saved window is a persisted value.
    await expect(main.getByLabel("Quiet from")).toHaveValue(/^(22:15|23:00)$/);
  });

  test("controls stay disabled until hydration, so early input is never lost or put in the URL", async ({ page }) => {
    // Hold the JS chunks: the streamed form is on screen but not hydrated (a slow phone or a loaded CI box).
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(PATH, { waitUntil: "commit" });
      const main = page.getByRole("main");
      const save = main.getByRole("button", { name: "Save preferences" });
      await expect(save).toBeVisible();
      await expect(save).toBeDisabled();
      await expect(main.getByRole("checkbox", { name: /^SMS text message/ })).toBeDisabled();
      release();
      await expect(save).toBeEnabled();
      const quiet = main.getByRole("checkbox", { name: "Do not send reminders during quiet hours" });
      if (!(await quiet.isChecked())) await quiet.check();
      // Role queries skip the hidden streamed copy React may still hold while it swaps in the client tree.
      await main.getByRole("textbox", { name: "Quiet from" }).fill("07:00");
      await main.getByRole("textbox", { name: "Quiet until" }).fill("07:00");
      await save.click();
      await expect(main.getByRole("alert").filter({ hasText: "Start and end cannot be the same time." })).toBeFocused();
      expect(new URL(page.url()).search).toBe("");
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("turning every channel off warns before saving; keyboard toggles a channel", async ({ page }) => {
    await page.goto(PATH);
    const main = page.getByRole("main");
    for (const name of ["SMS text message", "WhatsApp", "Email"]) {
      const box = main.getByRole("checkbox", { name: new RegExp(`^${name}`) });
      if (await box.isChecked()) await box.uncheck();
    }
    await expect(main.getByText("All channels are off.", { exact: false })).toBeVisible();
    const sms = main.getByRole("checkbox", { name: /^SMS text message/ });
    await sms.focus();
    await page.keyboard.press("Space");
    await expect(sms).toBeChecked();
    await expect(main.getByText("All channels are off.", { exact: false })).toHaveCount(0);
  });

  test("a stale tab gets a conflict notice and reloads fresh values", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    const stale = await context.newPage();
    const fresh = await context.newPage();
    await stale.goto(PATH);
    await fresh.goto(PATH);
    const fm = fresh.getByRole("main");
    await fm.getByRole("checkbox", { name: /^WhatsApp/ }).click();
    await fm.getByRole("button", { name: "Save preferences" }).click();
    await expect(fm.getByText("Preferences saved.").or(fm.getByText("These preferences changed in another window.", { exact: false }))).toBeVisible();

    const sm = stale.getByRole("main");
    await sm.getByRole("checkbox", { name: /^Email/ }).click();
    await sm.getByRole("button", { name: "Save preferences" }).click();
    await expect(sm.getByText("These preferences changed in another window.", { exact: false })).toBeVisible();
    await sm.getByRole("button", { name: "Reload preferences" }).click();
    await expect(sm.getByText("These preferences changed in another window.", { exact: false })).toHaveCount(0);
    await context.close();
  });

  test("te and hi render without raw keys and pass axe", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      await page.goto(`/${locale}/patient/settings/reminders`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(/patientAccount\.|reminders\.(channels|errors|state)\./);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
  });
});

test.describe("reminder preferences (guest)", () => {
  test.skip(MODE !== "guest", "needs the guest-mode fixture server");

  test("redirects to login with a safe return path", async ({ page }) => {
    await page.goto("/te/patient/settings/reminders");
    await expect(page).toHaveURL(/\/te\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/te/patient/settings/reminders");
  });
});
