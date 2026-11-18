/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- TEMPORARY: @playwright/test arrives with the fe2-a foundation merge (R-FE05-01). Remove this line then.
import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for identity e2e specs. Accounts are the SYNTHETIC fixture accounts in
 * src/fixtures/identity (fictional, @example.invalid). UI copy is matched through the
 * English message values listed here so a copy change is a one-line update.
 */

export const ACCOUNTS = {
  patientNew: "patient.new@example.invalid",
  patientComplete: "patient.complete@example.invalid",
  doctorDraft: "doctor.draft@example.invalid",
  doctorActive: "doctor.active@example.invalid",
  labOwner: "lab.owner@example.invalid",
  ambulance: "ambulance.operator@example.invalid",
  caregiverSuspended: "caregiver.suspended@example.invalid",
  verifier: "verifier@example.invalid",
  multiRole: "multi.role@example.invalid",
  disabled: "disabled@example.invalid",
} as const;

/** Fixture-only code (src/fixtures/identity/sessions.ts). Never a real OTP. */
export const FIXTURE_OTP = "246810";

/** English UI copy the specs rely on (src/messages/en/{auth,onboarding,admin,common}.json). */
export const COPY = {
  emailLabel: /email/i,
  passwordLabel: /password/i,
  phoneLabel: /mobile number/i,
  otpLabel: /verification code/i,
  signIn: /^sign in$/i,
  signOut: /sign out/i,
  createAccount: /create account/i,
  sendCode: /send code/i,
  verify: /^verify$/i,
  resend: /resend code/i,
  acceptTerms: /i agree to the terms/i,
  invalidCredentials: /email or password is incorrect/i,
  accountRestricted: /account is restricted/i,
  checkEmail: /check your email/i,
  otpInvalid: /code is incorrect/i,
  sessionExpired: /session expired/i,
  signedOut: /you have signed out/i,
  accessDenied: /you do not have access/i,
  fixtureNotice: /synthetic data/i,
  saveContinue: /save and continue/i,
  back: /^back$/i,
  submitReview: /submit for review/i,
  unknown: /^unknown$/i,
  none: /^none$|no known/i,
  listed: /^yes, list them$|^listed$/i,
  approve: /^approve$/i,
  reject: /^reject$/i,
  requestChanges: /request changes/i,
  suspend: /^suspend$/i,
  confirm: /^confirm$/i,
  reason: /reason/i,
  confirmCheckbox: /i have checked/i,
  startReview: /start review/i,
  documentViewerGated: /document viewing is not available yet/i,
} as const;

export async function signIn(page: Page, email: string, next?: string): Promise<void> {
  const url = next ? `/en/login?next=${encodeURIComponent(next)}` : "/en/login";
  await page.goto(url);
  await page.getByLabel(COPY.emailLabel).fill(email);
  await page.getByLabel(COPY.passwordLabel).fill("fixture-password");
  await page.getByRole("button", { name: COPY.signIn }).click();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: COPY.signOut }).click();
  await expect(page).toHaveURL(/\/en\/login\?reason=signed_out/);
}

/** Private data must never be persisted in browser storage (FRONTEND_MASTER s8, s19). */
export async function expectNoPrivateBrowserStorage(page: Page): Promise<void> {
  const stored = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(stored.local).toEqual([]);
  expect(stored.session).toEqual([]);
}

/** No OTP digits, tokens or emails in the URL. */
export function expectCleanUrl(page: Page): void {
  const url = page.url();
  expect(url).not.toContain(FIXTURE_OTP);
  expect(url).not.toMatch(/fixture-session|access|token|@example\.invalid/i);
}
