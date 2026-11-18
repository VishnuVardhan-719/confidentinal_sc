/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- TEMPORARY: @playwright/test arrives with the fe2-a foundation merge (R-FE05-01). Remove this line then.
import { defineConfig, devices } from "@playwright/test";

/**
 * Identity e2e (auth, onboarding, admin verification). Runs against the SYNTHETIC fixture
 * adapter only: never point this at real data. Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts
 * The dev-server fixture stores are process memory, so suites that mutate state run serially.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: ".",
  testMatch: ["auth.spec.ts", "onboarding.spec.ts", "admin-verification.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // Artifacts go to the OS temp dir, never into the repo.
  outputDir: `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/scv-e2e-identity`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" },
  },
});
