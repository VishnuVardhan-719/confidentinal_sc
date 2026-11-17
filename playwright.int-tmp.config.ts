// TEMPORARY: e2e against `next start` of the integration snapshot (tests/unit/app-shell.test.ts removed so it
// type-checks). Deleted after the run.
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...base,
  workers: 4,
  use: { ...base.use, baseURL: "http://127.0.0.1:3300" },
  webServer: {
    command: "npm run start -- -p 3300",
    cwd: "C:\\Users\\Yashwanth\\AppData\\Local\\Temp\\sc-int",
    url: "http://127.0.0.1:3300",
    env: { NEXT_PUBLIC_DEMO_MODE: "true" },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
