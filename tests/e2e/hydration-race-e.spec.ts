/**
 * R9-E4 (ADVERSARIAL_REVIEW R6-1): choose or type on /signup BEFORE hydration (JS chunks held
 * back, like a very slow phone), then let React hydrate.
 *
 * Contract: what the person sees is what gets submitted. A control either refuses input until it is
 * ready (disabled, announced as busy) or keeps the value in React state. A pick must never be
 * silently dropped or shown while state disagrees.
 */
import { expect, test, type Page } from "@playwright/test";
import { COPY, emailInput, passwordInput } from "./support/identity";

/** Load the server HTML but hold every JS chunk until `release()`. */
async function loadWithoutJs(page: Page, url: string): Promise<() => Promise<void>> {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return async () => {
    open();
    await page.waitForLoadState("networkidle");
  };
}

const roleRadio = (page: Page, name: RegExp) => page.getByRole("radio", { name });

test.describe("signup before hydration", () => {
  test("role radios refuse input until hydrated, then a pick is kept and submitted", async ({ page }) => {
    const release = await loadWithoutJs(page, "/en/signup");
    const doctor = roleRadio(page, /^doctor/i);
    // Not ready yet: the role group is disabled and marked busy, so an early tap cannot be lost.
    await expect(doctor).toBeDisabled();
    await expect(page.getByRole("group", { name: /signing up as/i })).toHaveAttribute("aria-busy", "true");
    const early = await doctor.click({ timeout: 1500 }).then(() => true, () => false);
    expect(early).toBe(false);

    await release();
    await expect(doctor).toBeEnabled();
    await expect(page.getByRole("group", { name: /signing up as/i })).not.toHaveAttribute("aria-busy", "true");
    await doctor.click();
    await expect(doctor).toBeChecked();
    // Switching method keeps the pick (state and screen agree).
    await page.getByRole("tab", { name: /mobile/i }).click();
    await expect(roleRadio(page, /^doctor/i)).toBeChecked();
    await page.getByRole("tab", { name: /^email/i }).click();
    await expect(roleRadio(page, /^doctor/i)).toBeChecked();

    // Submit: no "choose a role" error, so the server received the role on screen.
    await emailInput(page).fill("early.picker@example.invalid");
    await passwordInput(page).fill("a-long-enough-password");
    await page.getByLabel(COPY.acceptTerms).check();
    await page.getByRole("button", { name: COPY.createAccount }).click();
    // The account is created and signed in at once; the picked role decides where it lands.
    await expect(page).toHaveURL(/\/en\/doctor\/onboarding/);
  });

  test("a role preselected by ?role= is shown before hydration and survives it", async ({ page }) => {
    const release = await loadWithoutJs(page, "/en/signup?role=lab");
    await expect(roleRadio(page, /^laboratory/i)).toBeChecked();
    await release();
    await expect(roleRadio(page, /^laboratory/i)).toBeChecked();
    await expect(roleRadio(page, /^laboratory/i)).toBeEnabled();
  });

  test("email typed before hydration is kept (uncontrolled field)", async ({ page }) => {
    const release = await loadWithoutJs(page, "/en/signup");
    const typed = await emailInput(page).fill("typed.early@example.invalid", { timeout: 1500 }).then(() => true, () => false);
    await release();
    if (typed) await expect(emailInput(page)).toHaveValue("typed.early@example.invalid");
    test.info().annotations.push({ type: "pre-hydration email typed", description: String(typed) });
  });
});
