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
  testMatch: ["auth.spec.ts", "onboarding.spec.ts", "admin-verification.spec.ts", "profile.spec.ts", "navigation.spec.ts"],
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
    // Production build so Cache Components behave as deployed. Reuses a server already on E2E_PORT.
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" },
  },
});
