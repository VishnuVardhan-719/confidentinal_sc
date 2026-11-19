import { test as base, type Page } from "@playwright/test";
import { CLINICAL_OFF, E2E_ACCOUNTS, storageFor } from "./support/fixture-session";

/**
 * Doctor/patient workspace e2e on ONE synthetic fixture server, signed in through the real fe-b guards.
 *
 * "Signed in as" is now a fixture ACCOUNT, not a server: the old per-actor servers (interim
 * FIXTURE_DOCTOR_SESSION / FIXTURE_PATIENT_SESSION env switches) were removed when integration adopted
 * requireRole/authorizeRole.
 *   assigned -> multi.role@example.invalid (active patient + the assigned clinical-world doctor)
 *   other    -> doctor.other@example.invalid (a second doctor; must be denied the assigned doctor's data)
 *   anon     -> no sign-in
 *   gateOff  -> multi.role, on a server started WITHOUT FEATURE_CLINICAL. These tests only run when
 *               E2E_CLINICAL=off (second pass after restarting the server; see wsEnv("gateOff")).
 * The fixture world is process-wide and the specs mutate it, so run the workspace projects with one
 * worker against a freshly started server.
 */
export type WorkspaceServer = "assigned" | "other" | "anon" | "gateOff";
export type WorkspaceProject = "ws-desktop-1280" | "ws-mobile-390";

const PORT = Number(process.env.E2E_PORT ?? 3200);

/** Every workspace actor talks to the same server (PLAYWRIGHT_BASE_URL, else localhost:E2E_PORT). */
export function wsOrigin(project: string, server: WorkspaceServer): string {
  void project;
  void server;
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
}

const ACCOUNT: Record<WorkspaceServer, string | null> = {
  assigned: E2E_ACCOUNTS.patientAndDoctor,
  other: E2E_ACCOUNTS.otherDoctor,
  anon: null,
  gateOff: E2E_ACCOUNTS.patientAndDoctor,
};

/** Server env for the workspace runs. Synthetic fixture adapter only; never APP_ENV=production. */
export function wsEnv(server: "clinical" | "gateOff" = "clinical"): Record<string, string> {
  const common = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test", NEXT_TELEMETRY_DISABLED: "1", FIXTURE_BOOKING_SCENARIO: "accepted" };
  return server === "gateOff" ? common : { ...common, FEATURE_CLINICAL: "true" };
}

export const WS_PROJECTS: WorkspaceProject[] = ["ws-desktop-1280", "ws-mobile-390"];

/**
 * `page` is signed in as "assigned"; `as(who)` opens another signed-in (or anonymous) page.
 * `as("gateOff")` skips the test unless E2E_CLINICAL=off; with E2E_CLINICAL=off every other
 * clinical test is expected to be filtered out with --grep.
 */
export const wsTest = base.extend<{ as: (who: WorkspaceServer) => Promise<Page> }, { wsKey: string }>({
  wsKey: [async ({}, provide, workerInfo) => provide(`${workerInfo.project.name}-w${workerInfo.workerIndex}`), { scope: "worker" }],
  baseURL: async ({}, provide, testInfo) => provide(wsOrigin(testInfo.project.name, "assigned")),
  storageState: async ({ browser, baseURL, wsKey }, provide) => provide(await storageFor(browser, baseURL, E2E_ACCOUNTS.patientAndDoctor, wsKey)),
  as: async ({ browser, viewport, baseURL, wsKey }, provide, testInfo) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await provide(async (who) => {
      if (who === "gateOff") testInfo.skip(!CLINICAL_OFF, "needs the server without FEATURE_CLINICAL (E2E_CLINICAL=off)");
      const email = ACCOUNT[who];
      const storageState = email ? await storageFor(browser, baseURL, email, wsKey) : { cookies: [], origins: [] };
      const ctx = await browser.newContext({ baseURL, viewport, storageState });
      contexts.push(ctx);
      return ctx.newPage();
    });
    for (const c of contexts) await c.close();
  },
});
