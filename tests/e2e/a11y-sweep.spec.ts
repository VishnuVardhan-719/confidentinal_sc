/**
 * R8-D step 3: accessibility sweep over every doctor route and the public /verify routes, in
 * en/te/hi, at 390px (ws-mobile-390) and 1280px (ws-desktop-1280). Read-only: it only loads pages.
 * Each page: axe WCAG 2.1 A/AA clean, exactly one h1, a main landmark, no horizontal scroll and no
 * raw message keys. Denied (other doctor) and gate-off (no FEATURE_CLINICAL) states are swept too.
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

const LOCALES = ["en", "te", "hi"] as const;
const UNKNOWN_CODE = "0123456789abcdef0123456789abcdef";

const DOCTOR = [
  "/doctor/dashboard",
  "/doctor/requests",
  `/doctor/requests/${I.bookingRequest}`,
  "/doctor/visits",
  `/doctor/visits/${I.bookingToday}`,
  `/doctor/visits/${I.bookingActive}`,
  `/doctor/visits/${I.bookingPast}`,
  `/doctor/visits/${I.bookingActive}/consultation`,
  `/doctor/records/${I.consultationPastFinal}`,
  `/doctor/consultations/${I.bookingActive}`,
  `/doctor/consultations/${I.bookingUpcoming}`,
  `/doctor/consultations/${I.bookingUpcoming}/prescription`,
  "/doctor/availability",
  "/doctor/reviews",
  "/doctor/reviews?status=pending_moderation",
  "/doctor/services",
  "/doctor/profile",
  "/doctor/earnings",
  "/doctor/support",
  "/doctor/settings",
  "/doctor/visits/not..an..id",
];
const VERIFY = ["/verify", `/verify/${UNKNOWN_CODE}`, "/verify?error=invalid&code=abc"];
const DENIED = [`/doctor/visits/${I.bookingToday}`, `/doctor/consultations/${I.bookingPast}`];
const GATED = [`/doctor/visits/${I.bookingActive}/consultation`, `/doctor/records/${I.consultationPastFinal}`, `/doctor/consultations/${I.bookingPast}`, "/doctor/reviews", "/verify"];

async function sweep(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const text = await page.getByRole("main").innerText();
  expect(text, "raw message key").not.toMatch(/\b(doctor|clinical|common|errors|verify|consultationNotes|prescriptionDrafts|doctorReviews)\.[a-zA-Z]+\.[a-zA-Z.]+/);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, "horizontal scroll").toBeLessThanOrEqual(cw);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const locale of LOCALES) {
  test.describe(`a11y sweep ${locale}`, () => {
    for (const p of [...DOCTOR, ...VERIFY]) {
      test(`${locale}${p}`, async ({ page }) => {
        await sweep(page, `/${locale}${p}`);
      });
    }
    test(`${locale}: denied states (other doctor)`, async ({ as }) => {
      const page = await as("other");
      for (const p of DENIED) await sweep(page, `/${locale}${p}`);
    });
    test(`${locale}: gate-off states (no FEATURE_CLINICAL)`, async ({ as }) => {
      const page = await as("gateOff");
      for (const p of GATED) await sweep(page, `/${locale}${p}`);
    });
  });
}
