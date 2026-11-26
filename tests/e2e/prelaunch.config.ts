import { defineConfig, devices } from "@playwright/test";

/** Pre-launch mode against a production build with no backend. See .context/prelaunch-run.sh. */
const PORT = Number(process.env.E2E_PORT ?? 3330);

export default defineConfig({
  testDir: ".",
  testMatch: ["prelaunch.pl.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/scv-e2e-prelaunch`,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
});
