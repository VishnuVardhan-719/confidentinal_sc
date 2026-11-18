import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const categories = [
  { route: "doctors", category: "doctor", index: 1, unit: "visit" },
  { route: "lab-tests", category: "lab", index: 2, unit: "test" },
  { route: "ambulances", category: "ambulance", index: 3, unit: "trip" },
  { route: "caretakers", category: "caretaker", index: 4, unit: "hour" },
];
export const bookingId = "00000000-0000-4000-8000-000000000061";
export const addressId = "00000000-0000-4000-8000-000000000021";
export const privateMarker = "Synthetic E2E visit reason only";
export function providerId(index) { return "00000000-0000-4000-8000-" + String(index).padStart(12, "0"); }

// Activation requires the foundation owner's isolated scenario runner. These options
// never seed an app, create accounts, change cookies or grant access themselves.
export const test = base.extend({
  fixtureScenario: ["directory.available", { option: true }],
  identity: ["guest", { option: true }],
  storageState: async ({ identity }, provide) => {
    if (identity === "guest") { await provide({ cookies: [], origins: [] }); return; }
    const variable = "E2E_" + identity.toUpperCase() + "_STORAGE_STATE";
    const path = process.env[variable];
    if (!path) throw new Error("Missing authorized synthetic test-auth state: " + variable);
    await provide(path);
  },
  appObserver: async ({ fixtureScenario }, provide) => {
    const relative = process.env.E2E_APP_OBSERVER_MODULE;
    if (!relative) throw new Error("A coordinated app observation module is required for settled-call assertions");
    const root = path.resolve("tests/e2e"); const modulePath = path.resolve(root, relative);
    if (!modulePath.startsWith(root + path.sep) || path.extname(modulePath) !== ".mjs") {
      throw new Error("The test observation module must be an .mjs file inside tests/e2e");
    }
    const { createObserver } = await import(pathToFileURL(modulePath).href);
    if (typeof createObserver !== "function") throw new Error("Observation module must export createObserver");
    const observer = await createObserver({ scenario: fixtureScenario });
    if (typeof observer?.begin !== "function" || typeof observer?.settle !== "function" || typeof observer?.dispose !== "function") {
      throw new Error("Observer must implement begin, settle and dispose");
    }
    try { await provide(observer); } finally { await observer.dispose(); }
  },
  fixtureApp: [async ({ baseURL, fixtureScenario }, provide) => {
    if (process.env.APP_ENV !== "test" || process.env.FRONTEND_ADAPTER !== "fixture") {
      throw new Error("E2E specs require APP_ENV=test and FRONTEND_ADAPTER=fixture in runner and app");
    }
    const url = new URL(baseURL ?? "http://127.0.0.1:3000");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Use an isolated local fixture app");
    if (process.env.E2E_FIXTURE_SCENARIO !== fixtureScenario) {
      throw new Error("Scenario runner must reset and select fixture scenario: " + fixtureScenario);
    }
    await provide({ scenario: fixtureScenario });
  }, { auto: true }],
});
test.use({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000", trace: "off", video: "off", screenshot: "off" });
export { expect };
export function scenario(name, body) {
  test.describe(name, () => { test.use({ fixtureScenario: name }); body(); });
}
export async function visitFixture(page, path) {
  await page.goto(path);
  await expect(page.getByTestId("fixture-notice")).toBeVisible();
  await expect(page.getByTestId("fixture-notice")).toContainText(/synthetic|not live/i);
}
export async function expectFitsViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
export async function expectNoPrivateDraft(page) {
  expect(decodeURIComponent(page.url())).not.toContain(privateMarker);
  const leaked = await page.evaluate(marker => [localStorage, sessionStorage].some(storage =>
    Object.values(storage).some(value => String(value).includes(marker))), privateMarker);
  expect(leaked).toBe(false);
}
