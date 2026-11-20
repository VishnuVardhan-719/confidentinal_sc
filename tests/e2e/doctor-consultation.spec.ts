/**
 * Doctor post-visit documents (R7-D): consultation notes (task 2) and prescription drafts (task 3).
 * Synthetic fixture world only; `page` = assigned-doctor server (see workspace-servers.ts).
 * Notes and drafts are stored per server process, so each viewport project starts clean; tests that
 * share a document run serially.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsTest } from "./workspace-servers";
import { expectNoDialogs, guardDialogs, ready, warmUp } from "./workspace-ready";

// Signed in through the real fe-b guards (tests/e2e/workspace-servers.ts). Any browser dialog fails
// the test at once (never a 60 s hang); see workspace-ready.ts.
const test = wsTest.extend({
  page: async ({ page }, provide) => {
    const dialogs = guardDialogs(page);
    await provide(page);
    expectNoDialogs(dialogs);
  },
});

const notes = (id: string) => `/en/doctor/consultations/${id}`;

// Load each route's server chunks once per worker before the timed tests (cold `next start`).
test.beforeAll(async ({ playwright }, testInfo) => {
  const paths = [I.bookingPast, I.bookingActive].flatMap((id) => [notes(id), `${notes(id)}/prescription`, `/te/doctor/consultations/${id}`, `/hi/doctor/consultations/${id}/prescription`]);
  await warmUp(playwright, testInfo.project.name, ["assigned", "other", "gateOff", "anon"], [...paths, `/en/doctor/visits/${I.bookingPast}`]);
});
const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Flat 0", "Synthetic note text"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
async function expectCleanStorage(page: Page) {
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const m of PHI_MARKERS) expect(dump).not.toContain(m);
  for (const m of PHI_MARKERS) expect(decodeURIComponent(page.url())).not.toContain(m);
}
/** Every visible button/link in main is at least 44px tall (WCAG 2.5.8 target size, project rule). */
async function expectTargetSize(page: Page) {
  const small = await page.getByRole("main").evaluate((m) =>
    [...m.querySelectorAll<HTMLElement>("button, a[href], input[type=checkbox]")]
      .filter((el) => el.offsetParent !== null && !el.closest("nav[aria-label='Breadcrumb']"))
      .map((el) => {
        const box = (el.tagName === "INPUT" ? el.closest("label") ?? el : el).getBoundingClientRect();
        return { t: (el.textContent || el.getAttribute("aria-label") || el.id).trim().slice(0, 40), h: Math.round(box.height) };
      })
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
}
const badge = (page: Page, label: RegExp) => page.getByRole("region", { name: /visit and status/i }).getByRole("term").filter({ hasText: label }).locator("xpath=following-sibling::dd[1]");

test.describe("consultation notes: access and gate", () => {
  test("anonymous -> login with a safe next", async ({ as }) => {
    const page = await as("anon");
    await page.goto(notes(I.bookingPast));
    await expect(page).toHaveURL(new RegExp(`/en/login\\?next=${encodeURIComponent(notes(I.bookingPast))}$`));
  });

  test("another doctor gets the denied state", async ({ as }) => {
    const page = await as("other");
    await page.goto(notes(I.bookingPast));
    await expect(page.getByRole("main").getByText(/you do not have access/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("clinical flag off: gate notice and no form", async ({ as }) => {
    const page = await as("gateOff");
    await page.goto(notes(I.bookingPast));
    await expect(page.getByRole("main").getByText(/consultation notes are switched off/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("a booking that is not completed shows separate badges and no editor", async ({ page }) => {
    await page.goto(notes(I.bookingActive));
    await expect(page.getByText(/notes open after the visit is completed/i)).toBeVisible();
    await expect(badge(page, /^booking$/i)).toHaveText(/in progress/i);
    await expect(badge(page, /^notes$/i)).toHaveText(/not started/i);
    await expect(badge(page, /^payment$/i)).toHaveText(/due|not started|paid/i);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("malformed booking ID is not found", async ({ page }) => {
    await page.goto(notes("not..an..id"));
    await expect(page.getByRole("main").getByText(/^not found/i)).toBeVisible();
  });
});

test.describe("consultation notes: draft -> sign-off (serial)", () => {
  test.describe.configure({ mode: "serial" });

  test("visit page links completed visits to their notes", async ({ page }) => {
    await page.goto(`/en/doctor/visits/${I.bookingPast}`);
    await expect(page.getByRole("link", { name: /consultation notes/i })).toHaveAttribute("href", notes(I.bookingPast));
  });

  test("keyboard only: write the summary and save a draft; nothing is stored in the browser", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await ready(page);
    await expect(badge(page, /^booking$/i)).toHaveText(/completed/i);
    await expect(badge(page, /^payment$/i)).toHaveText(/paid/i);
    await expectNoAxeViolations(page);
    const summary = page.getByRole("textbox", { name: /visit summary/i });
    await summary.focus();
    await page.keyboard.type("Synthetic note text: reviewed at home.");
    await expect(page.getByRole("status").filter({ hasText: /unsaved changes/i })).toBeVisible();
    // Tab forward to Save draft and press it.
    const save = page.getByRole("button", { name: /save draft/i });
    for (let i = 0; i < 12 && !(await save.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: /draft saved/i })).toBeVisible();
    await expectCleanStorage(page);
    await page.reload();
    await ready(page);
    await expect(page.getByRole("textbox", { name: /visit summary/i })).toHaveValue("Synthetic note text: reviewed at home.");
    await expect(badge(page, /^notes$/i)).toHaveText(/draft/i);
    await expectNoHorizontalScroll(page);
    await expectTargetSize(page);
  });

  test("sign-off with missing details shows a focused error summary linking to each field", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await ready(page);
    await page.getByRole("button", { name: /sign off notes/i }).click();
    const summary = page.getByRole("alert").filter({ hasText: /advice given is required/i });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(/confirm the notes are accurate/i);
    await summary.getByRole("link", { name: /advice given is required/i }).click();
    await expect(page.getByRole("textbox", { name: /advice given/i })).toBeFocused();
    await expect(page.getByRole("textbox", { name: /advice given/i })).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations(page);
  });

  test("complete, attest and sign off -> read-only signed notes", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await page.getByRole("textbox", { name: /advice given/i }).fill("Synthetic advice: rest and fluids.");
    await page.getByRole("checkbox", { name: /i confirm these notes are accurate/i }).check();
    await page.getByRole("button", { name: /sign off notes/i }).click();
    await expect(page.getByRole("heading", { level: 2, name: /signed-off notes/i })).toBeVisible();
    await expect(page.getByText(/signed off by dr\. fixture asha \(synthetic\)/i)).toBeVisible();
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
    await expect(badge(page, /^notes$/i)).toHaveText(/signed off/i);
    await expect(page.getByText("Synthetic advice: rest and fluids.")).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("consultation notes: te/hi", () => {
  for (const locale of ["te", "hi"] as const) {
    test(`${locale}: translated, no raw keys, no overflow, axe clean`, async ({ page }) => {
      await page.goto(`/${locale}/doctor/consultations/${I.bookingActive}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.getByRole("main").innerText()).not.toMatch(/\b(consultationNotes|doctor|common)\.[a-zA-Z]+\.[a-zA-Z.]+/);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// R7-D task 3: prescription drafts (template-only, never issued)
const rx = (id: string) => `/en/doctor/consultations/${id}/prescription`;

test.describe("prescription draft: access and gate", () => {
  test("another doctor is denied; flag off shows the gate; not-completed has no editor", async ({ page, as }) => {
    const other = await as("other");
    await other.goto(rx(I.bookingPast));
    await expect(other.getByRole("main").getByText(/you do not have access/i)).toBeVisible();
    const off = await as("gateOff");
    await off.goto(rx(I.bookingPast));
    await expect(off.getByRole("main").getByText(/prescription drafts are switched off/i)).toBeVisible();
    await expect(off.getByRole("textbox")).toHaveCount(0);
    await page.goto(rx(I.bookingActive));
    await expect(page.getByText(/prescription drafts open after the visit is completed/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe("prescription draft: edit -> save -> discard (serial)", () => {
  test.describe.configure({ mode: "serial" });

  test("notes page links to the draft; page says Draft - not issued and offers no issue action", async ({ page }) => {
    await page.goto(notes(I.bookingPast));
    await expect(page.getByRole("link", { name: /prescription draft/i })).toHaveAttribute("href", rx(I.bookingPast));
    await page.goto(rx(I.bookingPast));
    await expect(page.getByRole("main").getByText("Draft - not issued").first()).toBeVisible();
    await expect(badge(page, /^prescription$/i)).toHaveText(/not started/i);
    await expect(page.getByRole("button", { name: /issue|send|sign/i })).toHaveCount(0);
    await expectNoAxeViolations(page);
    await expectTargetSize(page);
    await expectNoHorizontalScroll(page);
  });

  test("saving an empty row shows a focused error summary that links to each field", async ({ page }) => {
    await page.goto(rx(I.bookingPast));
    await ready(page);
    await page.getByRole("button", { name: /save draft/i }).click();
    const summary = page.getByRole("alert").filter({ hasText: /enter the name of medicine 1/i });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(/choose the form of medicine 1/i);
    await expect(summary).toContainText(/number of days for medicine 1/i);
    await summary.getByRole("link", { name: /enter the name of medicine 1/i }).click();
    await expect(page.getByRole("textbox", { name: /medicine name/i })).toBeFocused();
    await expectNoAxeViolations(page);
  });

  test("keyboard: fill a medicine from templates, save, see the not-issued preview; storage stays clean", async ({ page }) => {
    await page.goto(rx(I.bookingPast));
    await ready(page);
    await page.getByRole("textbox", { name: /medicine name/i }).focus();
    await page.keyboard.type("Synthetic note text medicine");
    await page.getByRole("combobox", { name: /^form/i }).selectOption("tablet");
    await page.getByRole("textbox", { name: /strength/i }).fill("500 mg");
    await page.getByRole("combobox", { name: /when to take/i }).selectOption("twice_daily");
    await page.getByRole("textbox", { name: /how many days/i }).fill("5");
    await page.getByRole("combobox", { name: /instruction/i }).selectOption("after_food");
    await page.getByRole("button", { name: /save draft/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: /draft saved/i })).toBeVisible();
    const preview = page.getByRole("region", { name: /saved draft/i });
    await expect(preview).toContainText("Draft - not issued. Not a valid prescription.");
    await expect(preview.getByRole("listitem")).toHaveText("Tablet: Synthetic note text medicine 500 mg, Twice a day for 5 days, after food");
    await expectCleanStorage(page);
    await page.reload();
    await ready(page);
    await expect(page.getByRole("textbox", { name: /medicine name/i })).toHaveValue("Synthetic note text medicine");
    await expect(badge(page, /^prescription$/i)).toHaveText(/draft - not issued/i);
  });

  test("add and remove medicines move focus sensibly", async ({ page }) => {
    await page.goto(rx(I.bookingPast));
    await ready(page);
    await page.getByRole("button", { name: /add medicine/i }).click();
    await expect(page.getByRole("group", { name: "Medicine 2" }).getByRole("textbox", { name: /medicine name/i })).toBeFocused();
    await page.getByRole("button", { name: /remove medicine 2/i }).click();
    await expect(page.getByRole("group", { name: "Medicine 2" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Medicine 1" }).getByRole("textbox", { name: /medicine name/i })).toBeFocused();
  });

  test("discard asks first, then removes the saved draft", async ({ page }) => {
    await page.goto(rx(I.bookingPast));
    await ready(page);
    await page.getByRole("button", { name: /discard draft/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/cannot be undone/i);
    await dialog.getByRole("button", { name: /discard draft/i }).click();
    await expect(badge(page, /^prescription$/i)).toHaveText(/not started/i);
    await expect(page.getByRole("textbox", { name: /medicine name/i })).toHaveValue("");
  });
});

test.describe("prescription draft: te/hi", () => {
  for (const locale of ["te", "hi"] as const) {
    test(`${locale}: translated, no raw keys, no overflow, axe clean`, async ({ page }) => {
      await page.goto(`/${locale}/doctor/consultations/${I.bookingPast}/prescription`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.getByRole("main").innerText()).not.toMatch(/\b(prescriptionDrafts|consultationNotes|doctor|common)\.[a-zA-Z]+\.[a-zA-Z.]+/);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
