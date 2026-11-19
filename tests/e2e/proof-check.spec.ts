/**
 * DC12 public proof-of-visit check (/verify, /verify/[code]). Synthetic fixture world only.
 * The doctor creates proofs on the assigned-doctor server (the fixture world is per process), so
 * the public page is opened on that same server; it needs no session. Uses the past, completed
 * booking so it never races the doctor spec, which regenerates proofs on the active booking.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsOrigin, type WorkspaceServer } from "./workspace-servers";

const test = base.extend<{ as: (who: WorkspaceServer) => Promise<Page> }>({
  baseURL: async ({}, provide, testInfo) => provide(wsOrigin(testInfo.project.name, "assigned")),
  as: async ({ browser, viewport }, provide, testInfo) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await provide(async (who) => {
      const ctx = await browser.newContext({ baseURL: wsOrigin(testInfo.project.name, who), viewport });
      contexts.push(ctx);
      return ctx.newPage();
    });
    for (const c of contexts) await c.close();
  },
});

const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Synthetic allergy entry", "Flat 0", "500001"];
const UNKNOWN = "0123456789abcdef0123456789abcdef";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
const main = (page: Page) => page.getByRole("main");
const codeField = (page: Page) => page.getByRole("textbox", { name: /proof code/i });

/** Create (or replace) the proof for the past booking as the assigned doctor; returns the code. */
async function issueProof(page: Page): Promise<string> {
  await page.goto(`/en/doctor/visits/${I.bookingPast}`);
  const card = page.getByRole("region", { name: /proof of visit/i });
  const create = card.getByRole("button", { name: /create proof of visit|create a new proof/i });
  const before = (await card.getByRole("definition").count()) > 0 ? await card.getByRole("definition").first().innerText() : null;
  await create.click();
  await expect(card.getByRole("definition").first()).not.toHaveText(before ?? "__none__");
  const code = (await card.getByRole("definition").first().innerText()).trim();
  expect(code).toMatch(/^[a-f0-9]{32}$/);
  return code;
}

test.describe("proof check: entry", () => {
  test("form works by keyboard and lands on the canonical result URL", async ({ page }) => {
    await page.goto("/en/verify");
    await expect(page.getByRole("heading", { level: 1, name: /check a proof of visit/i })).toBeVisible();
    await expect(main(page).getByText(/synthetic data, not live/i)).toBeVisible();
    await codeField(page).focus();
    await page.keyboard.type(UNKNOWN.toUpperCase().replace(/(.{4})/g, "$1 ").trim());
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/en/verify/${UNKNOWN}$`));
    await expect(main(page).getByRole("heading", { level: 2, name: /could not find this proof/i })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("empty and malformed codes show a field error and no lookup", async ({ page }) => {
    await page.goto("/en/verify");
    await page.getByRole("button", { name: /check proof/i }).click();
    await expect(codeField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByText(/enter the proof code/i)).toBeVisible();
    await codeField(page).fill("not a code");
    await codeField(page).press("Enter");
    await expect(main(page).getByText(/not a valid proof code/i)).toBeVisible();
    await expect(page).toHaveURL(/\/en\/verify\?code=/);
    await expectNoAxeViolations(page);
  });

  test("a malformed code in the URL reads as unknown", async ({ page }) => {
    await page.goto("/en/verify/..%2F..%2Fetc");
    await expect(main(page).getByRole("heading", { level: 2, name: /could not find this proof/i })).toBeVisible();
  });
});

test.describe("proof check: results (serial: shares one booking)", () => {
  test.describe.configure({ mode: "serial" });

  test("valid proof shows only date, service and doctor; no patient data", async ({ page }) => {
    const code = await issueProof(page);
    await page.goto(`/en/verify/${code}`);
    await expect(main(page).getByRole("heading", { level: 2, name: /this proof is valid/i })).toBeVisible();
    await expect(main(page).getByText("Doctor home visit")).toBeVisible();
    await expect(main(page).getByText("Dr. Fixture Asha (synthetic)")).toBeVisible();
    for (const m of PHI_MARKERS) await expect(page.getByText(m)).toHaveCount(0);
    await expect(page).toHaveTitle(/check a proof of visit/i);
    expect(await page.title()).not.toContain(code);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("grouped or uppercase codes redirect to the canonical URL", async ({ page }) => {
    const code = await issueProof(page);
    await page.goto(`/en/verify/${encodeURIComponent(code.toUpperCase().replace(/(.{4})(?=.)/g, "$1-"))}`);
    await expect(page).toHaveURL(new RegExp(`/en/verify/${code}$`));
    await expect(main(page).getByRole("heading", { level: 2, name: /this proof is valid/i })).toBeVisible();
  });

  test("replacing a proof withdraws the old code", async ({ page }) => {
    const old = await issueProof(page);
    const current = await issueProof(page);
    expect(current).not.toBe(old);
    await page.goto(`/en/verify/${old}`);
    await expect(main(page).getByRole("heading", { level: 2, name: /this proof was withdrawn/i })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the doctor's proof card links to the public check page", async ({ page }) => {
    const code = await issueProof(page);
    await expect(page.getByRole("link", { name: /open the public check page/i })).toHaveAttribute("href", `/en/verify/${code}`);
  });
});

test.describe("proof check: gate and locales", () => {
  test("clinical flag off: gate notice, no form, no result", async ({ as }) => {
    const page = await as("gateOff");
    for (const p of ["/en/verify", `/en/verify/${UNKNOWN}`]) {
      await page.goto(p);
      await expect(main(page).getByText(/proof checks are not available yet/i)).toBeVisible();
      await expect(codeField(page)).toHaveCount(0);
      await expect(main(page).getByRole("heading", { level: 2, name: /proof/i })).toHaveCount(0);
    }
    await expectNoAxeViolations(page);
  });

  for (const locale of ["te", "hi"] as const) {
    test(`${locale}: translated, no raw keys, no overflow, axe clean`, async ({ page }) => {
      await page.goto(`/${locale}/verify/${UNKNOWN}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await main(page).innerText()).not.toMatch(/\bverify\.[a-z]+\.[a-zA-Z.]+/);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
