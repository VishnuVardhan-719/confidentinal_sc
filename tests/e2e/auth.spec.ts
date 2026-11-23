import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, COPY, FIXTURE_OTP, emailInput, expectCleanUrl, passwordInput, expectNoPrivateBrowserStorage, signIn, signOut, visible } from "./support/identity";

/**
 * FE03/FE04 auth journeys against the SYNTHETIC fixture adapter.
 * test.describe.fixme: pages (/login, /signup, guards) are built after the fe2-a merge.
 */

test.describe("sign in", () => {
  test("shows the synthetic-data notice and passes axe", async ({ page }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await expect(visible(page.getByText(COPY.fixtureNotice))).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("valid fixture account lands on its dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    await expect(page).toHaveURL("/en/patient/dashboard");
    await expectNoPrivateBrowserStorage(page);
    expectCleanUrl(page);
  });

  test("honours an internal ?next= the user may open", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete, "/en/patient/bookings");
    await expect(page).toHaveURL("/en/patient/bookings");
  });

  for (const next of ["https://evil.example/en", "//evil.example", "/\\evil.example", "/en/admin/audit", "/api/auth/logout"]) {
    test(`ignores unsafe or unauthorized next=${next}`, async ({ page }) => {
      await signIn(page, ACCOUNTS.patientComplete, next);
      await expect(page).toHaveURL("/en/patient/dashboard");
    });
  }

  test("wrong credentials show one generic message and keep the email, not the password", async ({ page }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await emailInput(page).fill("nobody@example.invalid");
    await passwordInput(page).fill("wrong-password");
    await page.getByRole("button", { name: COPY.signIn }).click();
    // Next renders its own (empty) route-announcer alert, so match the form alert by text.
    await expect(visible(page.getByRole("alert").filter({ hasText: COPY.invalidCredentials }))).toBeVisible();
    await expect(emailInput(page)).toHaveValue("nobody@example.invalid");
    await expect(passwordInput(page)).toHaveValue("");
  });

  test("restricted account cannot sign in", async ({ page }) => {
    await signIn(page, ACCOUNTS.disabled, undefined, { expectSuccess: false });
    await expect(visible(page.getByRole("alert"))).toContainText(COPY.accountRestricted);
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("multi-role users choose a workspace", async ({ page }) => {
    await signIn(page, ACCOUNTS.multiRole);
    await expect(page).toHaveURL("/en/workspace/select");
    await visible(page.getByRole("link", { name: /doctor/i })).click();
    await expect(page).toHaveURL("/en/doctor/dashboard");
  });

  test("sign out clears the session; private pages then require sign-in", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    // The patient dashboard belongs to another workstream; sign out from the account page.
    await page.goto("/en/account/security", { waitUntil: "domcontentloaded" });
    await signOut(page);
    await expect(page.getByText(COPY.signedOut)).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.filter((c) => c.name === "scv_at" || c.name === "scv_rt")).toEqual([]);
    await page.goto("/en/patient/profile", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/en/login?next=%2Fen%2Fpatient%2Fprofile");
  });

  test("session cookies are httpOnly and SameSite=Lax", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    const session = (await page.context().cookies()).filter((c) => c.name.startsWith("scv_"));
    expect(session.length).toBe(2);
    for (const c of session) {
      expect(c.httpOnly).toBe(true);
      expect(c.sameSite).toBe("Lax");
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain("scv_");
  });

  test("expired session asks to sign in again", async ({ page, context }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    // Simulate access-token expiry while the refresh cookie remains.
    const refresh = (await context.cookies()).find((c) => c.name === "scv_rt");
    await context.clearCookies();
    if (refresh) await context.addCookies([refresh]);
    await page.goto("/en/patient/profile", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fpatient%2Fprofile&reason=session_expired/);
    await expect(visible(page.getByText(COPY.sessionExpired))).toBeVisible();
  });
});

test.describe("sign up", () => {
  test("offers patient and four provider roles, never admin", async ({ page }) => {
    await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
    const roles = page.getByRole("radiogroup");
    for (const name of [/^patient/i, /^doctor/i, /^lab/i, /^ambulance/i, /^(caretaker|caregiver)/i]) {
      await expect(roles.getByRole("radio", { name })).toBeVisible();
    }
    await expect(roles.getByRole("radio", { name: /admin/i })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("missing consent shows a focused error summary that links to the first invalid field", async ({ page }) => {
    await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: /^patient/i }).check();
    await emailInput(page).fill("new.person@example.invalid");
    await passwordInput(page).fill("a-long-enough-password");
    await page.getByRole("button", { name: COPY.createAccount }).click();
    // Skip Next's empty route-announcer alert. The summary takes focus (GOV.UK pattern); its link moves focus to the field.
    const summary = visible(page.getByRole("alert").filter({ hasText: /\w/ }));
    await expect(summary).toBeFocused();
    await summary.getByRole("link").first().click();
    await expect(page.getByLabel(COPY.acceptTerms)).toBeFocused();
  });

  test("email signup signs straight in and opens the chosen role's onboarding (no check-your-email step)", async ({ page }) => {
    const roles = [
      [/^patient/i, "patient"],
      [/^doctor/i, "doctor"],
      [/^laboratory/i, "lab"],
      [/^ambulance/i, "ambulance"],
      [/^caretaker/i, "caretaker"],
    ] as const;
    for (const [name, role] of roles) {
      await page.context().clearCookies();
      await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
      await page.getByRole("radio", { name }).check();
      await emailInput(page).fill(`brand.new.${role}@example.invalid`);
      await passwordInput(page).fill("a-long-enough-password");
      await page.getByLabel(COPY.acceptTerms).check();
      await page.getByRole("button", { name: COPY.createAccount }).click();
      await expect(page).toHaveURL(new RegExp(`/en/${role}/onboarding`));
      await expect(page.getByText(COPY.checkEmail)).toHaveCount(0);
    }
  });

  test("phone OTP: wrong code, throttled resend, paste with spaces, then onboarding of chosen role", async ({ page }) => {
    await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: /^doctor/i }).check();
    await page.getByRole("tab", { name: /mobile/i }).click();
    await page.getByRole("textbox", { name: COPY.phoneLabel }).fill("+916000000002");
    await page.getByLabel(COPY.acceptTerms).check();
    await page.getByRole("button", { name: COPY.sendCode }).click();

    const otp = page.getByLabel(COPY.otpLabel);
    await expect(otp).toBeVisible();
    await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
    // Countdown comes from server time; resend starts disabled.
    await expect(page.getByRole("button", { name: COPY.resend })).toBeDisabled();
    await expect(page.getByText(/\d+ s|\d+ seconds/)).toBeVisible();

    await otp.fill("000000");
    await page.getByRole("button", { name: COPY.verify }).click();
    await expect(visible(page.getByRole("alert").filter({ hasText: COPY.otpInvalid }))).toBeVisible();
    // role=alert is an implicit assertive live region.
    await expect(page.locator("[aria-live], [role=alert]").filter({ hasText: COPY.otpInvalid })).not.toHaveCount(0);

    await otp.fill(` ${FIXTURE_OTP.slice(0, 3)} ${FIXTURE_OTP.slice(3)} `);
    await page.getByRole("button", { name: COPY.verify }).click();
    await expect(page).toHaveURL("/en/doctor/onboarding");
    expectCleanUrl(page);
    await expectNoPrivateBrowserStorage(page);
  });
});

test.describe("direct URL access", () => {
  const PRIVATE = ["/en/patient/profile", "/en/patient/onboarding", "/en/doctor/onboarding", "/en/admin/providers", "/en/admin/coverage", "/en/workspace/select", "/en/account/security"];

  for (const path of PRIVATE) {
    test(`anonymous ${path} redirects to login with next`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(`/en/login?next=${encodeURIComponent(path)}`);
    });
  }

  test("a patient cannot open admin or another role's workspace, and sees no private data", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    // A wrong role is sent to its own landing page (requireRole), revealing nothing about the area.
    // /doctor/dashboard is fe-d's page (not on this branch); role isolation is unit-tested.
    for (const path of ["/en/admin/providers", "/en/admin/providers/00000000-0000-4000-8000-000000003001", "/en/admin/coverage"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL("/en/patient/dashboard");
      await expect(page.getByText(/synthetic diagnostics/i)).toHaveCount(0);
    }
  });

  test("case, encoding and dot-segment tricks do not bypass the guard", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientComplete);
    for (const path of ["/en/ADMIN/providers", "/en/%61dmin/providers", "/en/patient/../admin/providers"]) {
      // A guard redirect can replace this navigation mid-flight (net::ERR_ABORTED); the end state is what matters.
      await page.goto(path, { waitUntil: "domcontentloaded" }).catch((e: Error) => {
        if (!/ERR_ABORTED/.test(e.message)) throw e;
      });
      await page.waitForLoadState("load");
      await expect(page).not.toHaveURL(/\/admin\//);
      await expect(page.getByText(/synthetic diagnostics/i)).toHaveCount(0);
    }
  });

  test("emergency guidance works signed out and for incomplete patients", async ({ page }) => {
    await page.goto("/en/emergency", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Call 108", exact: true })).toHaveAttribute("href", "tel:108");
    await signIn(page, ACCOUNTS.patientNew);
    await page.goto("/en/emergency", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Call 108", exact: true })).toBeVisible();
  });
});
