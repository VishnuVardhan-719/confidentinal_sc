/**
 * Shared waits for the workspace specs (R9-D10). Root causes they address:
 * - Hydration: clinical forms are disabled until React hydrates (R-FE-D-40). `focus()` and
 *   `keyboard.type()` do not auto-wait, so typing into a still-disabled field was silently lost on a
 *   busy machine. `ready()` waits for every HydrationStatus marker to clear instead of `networkidle`.
 * - Unload prompts: a navigation while an editor is dirty opens a beforeunload dialog; Playwright
 *   dismisses it, the navigation is cancelled and the test hangs until the 60 s timeout.
 *   `guardDialogs()` accepts it so the test fails at once with a clear message instead.
 * - Cold routes: the first request to each route of a fresh `next start` loads its server chunks.
 *   `warmUp()` requests the spec's routes once per worker so test timings do not include that.
 */
import { expect, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { wsOrigin, type WorkspaceServer } from "./workspace-servers";

/** React owns the page: every hydration-gated form or panel has cleared its "Please wait." status. */
export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.readyState === "complete" && [...document.querySelectorAll("[data-hydration-status]")].every((el) => el.textContent === ""),
    undefined,
    { timeout: 15_000 },
  );
}

/** Record every browser dialog; beforeunload is accepted so a navigation can never hang. */
export function guardDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on("dialog", (d) => {
    seen.push(`${d.type()}${d.message() ? `: ${d.message()}` : ""}`);
    void (d.type() === "beforeunload" ? d.accept() : d.dismiss());
  });
  return seen;
}

export function expectNoDialogs(seen: string[]): void {
  expect(seen, "unexpected browser dialog (beforeunload = navigated away with unsaved changes)").toEqual([]);
}

/** GET each path once on each server so route chunks are loaded before the timed tests. */
export async function warmUp(playwright: PlaywrightWorkerArgs["playwright"], project: string, servers: WorkspaceServer[], paths: string[]): Promise<void> {
  for (const server of servers) {
    const ctx = await playwright.request.newContext({ baseURL: wsOrigin(project, server) });
    try {
      for (const p of paths) await ctx.get(p, { maxRedirects: 0, timeout: 30_000 }).catch(() => undefined);
    } finally {
      await ctx.dispose();
    }
  }
}
