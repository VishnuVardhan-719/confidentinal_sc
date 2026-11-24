import { expect, test } from "@playwright/test";
import { COPY, emailInput, passwordInput, signIn, signOut, visible } from "./support/identity";

/**
 * Each signup role keeps its own identity on SYNTHETIC data: a provider who signs up and later signs in again
 * lands on their own application (licence, experience and so on), never on the patient questionnaire.
 */
test.describe.configure({ mode: "serial" });

const PROVIDERS = [
  [/^doctor/i, "doctor"],
  [/^laboratory/i, "lab"],
  [/^ambulance/i, "ambulance"],
  [/^caretaker/i, "caretaker"],
] as const;

for (const [name, role] of PROVIDERS) {
  test(`a new ${role} signs in again to their own application, not the patient form`, async ({ page }) => {
    const email = `again.${role}@example.invalid`;
    await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name }).check();
    await emailInput(page).fill(email);
    await passwordInput(page).fill("a-long-enough-password");
    await page.getByLabel(COPY.acceptTerms).check();
    await page.getByRole("button", { name: COPY.createAccount }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${role}/onboarding`));
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(`/en/${role}/onboarding`));
    await expect(page.getByText(/blood group/i)).toHaveCount(0);
    await page.goto("/en/workspace/select", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/patient\//);
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
  });
}

test("a new patient who finishes the questionnaire is no longer sent back to it", async ({ page }) => {
  const email = "again.patient@example.invalid";
  await page.goto("/en/signup", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: /^patient/i }).check();
  await emailInput(page).fill(email);
  await passwordInput(page).fill("a-long-enough-password");
  await page.getByLabel(COPY.acceptTerms).check();
  await page.getByRole("button", { name: COPY.createAccount }).click();
  await expect(page).toHaveURL(/\/en\/patient\/onboarding/);
});
