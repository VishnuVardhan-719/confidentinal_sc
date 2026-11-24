import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, type Browser } from "@playwright/test";
import { signIn } from "./identity";

/**
 * Real fe-b sign-in for e2e specs (replaces the removed FIXTURE_PATIENT_SESSION / FIXTURE_DOCTOR_SESSION
 * server switches). Accounts are SYNTHETIC fixture accounts (src/fixtures/identity, @example.invalid);
 * the fixture auth adapter accepts any 1-128 character password (phone login uses OTP 246810).
 * Each worker signs in once per account through the login form and reuses the resulting cookie jar.
 */
export const E2E_ACCOUNTS = {
  /** Active patient; mapped to the synthetic clinical-world patient A. */
  patient: "patient.complete@example.invalid",
  /** Active patient + active doctor; doctor mapped to the assigned clinical-world doctor. */
  patientAndDoctor: "multi.role@example.invalid",
  doctor: "doctor.active@example.invalid",
  /** Second active doctor (clinical-world doctorOther): proves doctor-to-doctor isolation. */
  otherDoctor: "doctor.other@example.invalid",
} as const;

const cache = new Map<string, string>();

/** Storage-state file for `email`, signing in once per worker, project and account. */
export async function storageFor(browser: Browser, baseURL: string | undefined, email: string, key: string): Promise<string> {
  const id = `${key}:${email}`;
  const hit = cache.get(id);
  if (hit) return hit;
  // Explicitly empty: inside a test, browser.newContext() inherits the project's storageState.
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  // The first-visit locality prompt would cover pages under test; these visitors have already answered it.
  await ctx.addInitScript(() => localStorage.setItem("scv.location.v1", JSON.stringify({ v: 1, skipped: true })));
  const page = await ctx.newPage();
  await signIn(page, email);
  const file = join(tmpdir(), `scv-e2e-${key}-${email.split("@")[0]}.json`);
  await ctx.storageState({ path: file });
  await ctx.close();
  cache.set(id, file);
  return file;
}

/** `test` whose page and context are signed in as the synthetic patient. */
export const patientTest = base.extend<object, { patientStorage: string }>({
  patientStorage: [
    async ({ browser }, provide, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      await provide(await storageFor(browser, baseURL, E2E_ACCOUNTS.patient, `${workerInfo.project.name}-w${workerInfo.workerIndex}`));
    },
    { scope: "worker" },
  ],
  storageState: async ({ patientStorage }, provide) => provide(patientStorage),
});

/** Server env used by the integration runs (one server, synthetic fixture adapter, never production). */
export const CLINICAL_OFF = process.env.E2E_CLINICAL === "off";
