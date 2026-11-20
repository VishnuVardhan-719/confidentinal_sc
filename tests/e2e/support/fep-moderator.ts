import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * fe-p moderator session for the review-moderation e2e, on two kinds of server:
 *
 * - fe2-p fixture servers (`E2E_FEP_MODE` is set): no login page exists on this branch. The "on"
 *   server sets FIXTURE_ADMIN_SESSION=moderator (server env, fixture mode only), so every request
 *   is the synthetic moderator and no sign-in happens.
 * - integration (`E2E_FEP_MODE` unset): the server switch was removed. Sign in through the fe-b
 *   login form as the SYNTHETIC lead admin (`ops.admin.lead@example.invalid`, operations principal
 *   `fx-adm-super`, which holds `review:moderate`), once per worker, and reuse the cookie jar.
 *   Same pattern as tests/e2e/support/fixture-session.ts on feat/fe2-integration; the fixture auth
 *   adapter accepts any 1-128 character password. Synthetic account, never a real person.
 */
export const FEP_SERVER = process.env.E2E_FEP_MODE !== undefined;
/** fe2-p "on" server: the synthetic moderator is the server-wide session. */
export const SERVER_MODERATOR = FEP_SERVER && process.env.E2E_FEP_MODE === "session" && process.env.E2E_FEP_CLINICAL === "on";
/** A moderator is available: the fe2-p "on" server, or any integration server (sign in). */
export const MODERATOR_AVAILABLE = SERVER_MODERATOR || !FEP_SERVER;
export const MODERATOR_EMAIL = "ops.admin.lead@example.invalid";

// Next keeps earlier routes mounted but hidden, so act on the first visible match only.
const visible = (l: Locator) => l.filter({ visible: true }).first();

export async function signInAsModerator(page: Page): Promise<void> {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await visible(page.getByRole("textbox", { name: /email/i })).fill(MODERATOR_EMAIL);
  await visible(page.getByLabel(/password/i).and(page.locator("input"))).fill("fixture-password");
  await visible(page.getByRole("button", { name: /^sign in$/i })).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}

const cache = new Map<string, string>();

async function moderatorStorage(browser: Browser, baseURL: string | undefined, key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await signInAsModerator(page);
  const file = join(tmpdir(), `scv-e2e-fep-moderator-${key}.json`);
  await ctx.storageState({ path: file });
  await ctx.close();
  cache.set(key, file);
  return file;
}

/** `test` whose page is the moderator: signed in on integration, the server session on fe2-p. */
export const moderatorTest = base.extend<object, { moderatorStorage: string | undefined }>({
  moderatorStorage: [
    async ({ browser }, provide, workerInfo) => {
      if (FEP_SERVER) return provide(undefined);
      await provide(await moderatorStorage(browser, workerInfo.project.use.baseURL, `${workerInfo.project.name}-w${workerInfo.workerIndex}`));
    },
    { scope: "worker" },
  ],
  storageState: async ({ moderatorStorage: file, storageState }, provide) => provide(file ?? storageState),
});
