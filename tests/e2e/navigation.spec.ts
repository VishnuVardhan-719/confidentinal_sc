import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, COPY, signIn, signOut, visible } from "./support/identity";

/**
 * USER-REQ-1 A: every link reachable from the signed-in chrome and the auth pages resolves to a
 * real page (no 404, no error boundary). Role dashboards and most role pages are owned by other
 * workstreams; their walk is `fixme` until those routes exist on this branch.
 */

async function expectRealPage(page: Page, href: string) {
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  expect(response?.status(), href).toBeLessThan(400);
  await expect(page.getByText("We could not find that page"), href).toHaveCount(0);
  await expect(page.getByText("This page did not load"), href).toHaveCount(0);
}

/**
 * Routes owned by other workstreams that are not on this branch (REQUESTS R-FE06-06, R-FE07-04):
 * public directory pages and role dashboards/bookings. Every other internal link must resolve.
 */
const OWNED_ELSEWHERE = /^\/(en|te|hi)\/(doctors|labs|lab-tests|ambulances?|caretakers?|caregivers|services|search)(\/|$|\?)|^\/(en|te|hi)\/(patient|doctor|lab|ambulance|caretaker|admin)\/(dashboard|bookings)/;

async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("a[href^='/']:visible").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.filter((h) => h && !h.startsWith("/api/") && !h.includes("#") && !OWNED_ELSEWHERE.test(h)))];
}

test.describe("navigation: auth and account pages", () => {
  test("auth pages link to each other and to legal drafts", async ({ page }) => {
    for (const start of ["/en/login", "/en/signup", "/en/recover"]) {
      await page.goto(start, { waitUntil: "domcontentloaded" });
      for (const href of await internalLinks(page)) await expectRealPage(page, href);
    }
  });

  test("signed-in chrome: My workspace, account pages and sign out all work", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/account/security");
    await expect(page).toHaveURL("/en/account/security");
    // The page and its header stream in after the URL changes; wait for both before reading links.
    await expect(visible(page.getByRole("button", { name: COPY.signOut }))).toBeVisible();
    await expect(visible(page.getByRole("link", { name: COPY.myWorkspace }))).toBeVisible();
    const links = await internalLinks(page);
    expect(links).toContain("/en/patient/onboarding");
    for (const href of links) await expectRealPage(page, href);
    await page.goto("/en/account/security", { waitUntil: "domcontentloaded" });
    await signOut(page);
  });

  test("multi-role users reach the workspace chooser after sign in", async ({ page }) => {
    await signIn(page, ACCOUNTS.multiRole);
    await expect(page).toHaveURL("/en/workspace/select");
    await expect(visible(page.getByRole("link", { name: /doctor/i }))).toBeVisible();
  });

  test("post-login lands on the role's onboarding or dashboard", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew);
    await expect(page).toHaveURL("/en/patient/onboarding");
    await page.context().clearCookies();
    await signIn(page, ACCOUNTS.patientComplete);
    await expect(page).toHaveURL("/en/patient/dashboard");
  });
});

test.describe.fixme("navigation: role workspaces (pages owned by other workstreams)", () => {
  const ROLE_ACCOUNTS = [ACCOUNTS.patientComplete, ACCOUNTS.doctorActive, ACCOUNTS.labOwner, ACCOUNTS.verifier];
  for (const account of ROLE_ACCOUNTS) {
    test(`every nav item for ${account} resolves`, async ({ page }) => {
      await signIn(page, account);
      for (const href of await internalLinks(page)) await expectRealPage(page, href);
      await expect(page.getByRole("button", { name: COPY.signOut }).first()).toBeVisible();
    });
  }
});
