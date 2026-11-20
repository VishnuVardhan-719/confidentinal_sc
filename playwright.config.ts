import { defineConfig, devices } from "@playwright/test";

/*
 * Default: production build + `next start` on 3300. Browser tests stub the app's /api routes with synthetic
 * data (tests/e2e/helpers.ts mockBackend), so no database or Supabase project is needed.
 *   E2E_DEV=1          -> `next dev` on 3200 instead (faster loop, dev-only warnings appear)
 *   E2E_BASE_URL=<url> -> test an already-running server (e.g. Claude's integration build); no webServer
 */
const dev = process.env.E2E_DEV === "1";
const external = process.env.E2E_BASE_URL;
const PORT = dev ? 3200 : 3300;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: dev ? `npm run dev -- --port ${PORT}` : `npm run build && npm run start -- -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: dev ? 120_000 : 300_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
