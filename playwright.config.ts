import { defineConfig, devices } from "@playwright/test";
import { wsEnv } from "./tests/e2e/workspace-servers";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/** Doctor/patient workspace (and proof-check, consultation, reviews) specs mutate the process-wide synthetic world: run them in order (tests/e2e/workspace-servers.ts). */
const WORKSPACE_SPECS = /(doctor-workspace|patient-workspace|proof-check|doctor-consultation|doctor-reviews)\.spec\.ts$/;
const mobile = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true };
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };

/**
 * E2E runs against a production build (`next build && next start`) unless PLAYWRIGHT_BASE_URL points
 * at an already running server. Synthetic content only; traces/screenshots stay in test-results/.
 * All specs sign in through the real fe-b guards with synthetic fixture accounts, so one server serves\n * every actor. Clinical-off checks need a second run with the server started without FEATURE_CLINICAL\n * and E2E_CLINICAL=off.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-390", testIgnore: WORKSPACE_SPECS, use: mobile },
    { name: "desktop-1280", testIgnore: WORKSPACE_SPECS, use: desktop },
    // Stateful synthetic world: tests in a file run in order, one server set per viewport.
    { name: "ws-desktop-1280", testMatch: WORKSPACE_SPECS, fullyParallel: false, use: desktop },
    { name: "ws-mobile-390", testMatch: WORKSPACE_SPECS, fullyParallel: false, use: mobile },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: `${baseURL}/en`,
        env: wsEnv(),
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
      },
});
