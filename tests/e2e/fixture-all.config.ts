import { defineConfig, devices } from "@playwright/test";

/**
 * Integration smoke (fe-int2) against an already running production build of
 * feat/fe2-integration. SYNTHETIC fixture adapter only. Start the server first:
 *   FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true FIXTURE_BOOKING_SCENARIO=accepted \
 *     npx next build && npx next start --port 3320
 * then: npx playwright test --config tests/e2e/integration.config.ts
 */
const PORT = Number(process.env.E2E_PORT ?? 3320);

export default defineConfig({
  testDir: ".",
  testMatch: ["*.spec.ts"], testIgnore: ["perf.spec.ts","integration-smoke.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: `${process.env.TEMP ?? "/tmp"}/scv-int2-smoke.json` }]],
  outputDir: `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/scv-e2e-int2`,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
