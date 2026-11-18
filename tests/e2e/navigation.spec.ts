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

async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("a[href^='/']:visible").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.filter((h) => h && !h.startsWith("/api/") && !h.includes("#")))];
}

test.describe("navigation: auth and account pages", () => {
  // fixme: shared public chrome links /en/doctors (fe-a route, not built yet). REQUESTS.md R-FE06-06.
  test.fixme("auth pages link to each other and to legal drafts", async ({ page }) => {
    for (const start of ["/en/login", "/en/signup", "/en/recover"]) {
      await page.goto(start, { waitUntil: "domcontentloaded" });
      for (const href of await internalLinks(page)) await expectRealPage(page, href);
    }
  });

  // fixme: My workspace for an incomplete patient opens /en/patient/onboarding (PHASE2-B wizard, not built yet). R-FE06-07.
  test.fixme("signed-in chrome: My workspace, account pages and sign out all work", async ({ page }) => {
    await signIn(page, ACCOUNTS.patientNew, "/en/account/security");
    await expect(page).toHaveURL("/en/account/security");
    for (const href of await internalLinks(page)) {
      // Role pages owned by other workstreams are covered by the fixme walk below.
      if (/^\/(en|te|hi)\/(patient|doctor|lab|ambulance|caretaker|admin)\/(dashboard|bookings)/.test(href)) continue;
      await expectRealPage(page, href);
    }
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
