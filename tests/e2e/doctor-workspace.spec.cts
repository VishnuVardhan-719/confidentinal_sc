/**
 * FE10-FE12 doctor workspace e2e (SKELETON, all suites skipped until the pages exist).
 *
 * File extension: `.cts` on purpose. `@playwright/test` is added to package.json by the fe2-a
 * foundation; until that merge, a `.ts` spec would break `npm run typecheck` (tsconfig includes
 * **\/*.ts and **\/*.mts). Playwright's default testMatch already runs `.cts`. After the merge,
 * rename to `doctor-workspace.spec.ts`, remove `.skip`, and wire `signInAsFixtureDoctor`.
 *
 * Run: FRONTEND_ADAPTER=fixture FEATURE_CLINICAL=true npx playwright test tests/e2e/doctor-workspace.spec.ts
 * All data is synthetic (src/fixtures/clinical). Never run against real patient data.
 */
import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";

const LOCALE = "en";
const D = `/${LOCALE}/doctor`;
const path = {
  dashboard: `${D}/dashboard`,
  requests: `${D}/requests`,
  visits: `${D}/visits`,
  visit: (id: string) => `${D}/visits/${id}`,
  consultation: (id: string) => `${D}/visits/${id}/consultation`,
  record: (id: string) => `${D}/records/${id}`,
};

/** Strings from the synthetic world that must never appear in URLs or browser storage. */
const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Synthetic allergy entry", "Synthetic complaint"];

/** TODO(after fe2-b auth merge): sign in through the fixture auth adapter as the assigned doctor. */
async function signInAsFixtureDoctor(page: Page, which: "assigned" | "other" = "assigned"): Promise<void> {
  void which;
  await page.goto(`/${LOCALE}/login`);
  throw new Error("signInAsFixtureDoctor: wire to the fixture auth adapter once src/modules/auth is merged");
}

async function expectNoPhiInUrlOrStorage(page: Page) {
  const url = page.url();
  for (const m of PHI_MARKERS) expect(url, "URL must not contain PHI").not.toContain(encodeURIComponent(m));
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const m of PHI_MARKERS) expect(dump, "browser storage must not contain PHI").not.toContain(m);
}

async function expectSyntheticNotice(page: Page) {
  // FixtureNotice text comes from common messages ("Synthetic data - not live").
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
}

test.describe.skip("doctor guard and shell", () => {
  test("unauthenticated visit redirects to login with a safe next", async ({ page }) => {
    await page.goto(path.visit(I.bookingToday));
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/login\\?next=%2F${LOCALE}%2Fdoctor%2Fvisits%2F`));
  });

  test("dashboard shows requests, today visits and the active consultation", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.dashboard);
    await expectSyntheticNotice(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // TODO: assert pending request card, today list (2), active consultation link.
  });
});

test.describe.skip("DC01 assigned doctor access", () => {
  test("other doctor gets the denied state for a known visit ID", async ({ page }) => {
    await signInAsFixtureDoctor(page, "other");
    await page.goto(path.visit(I.bookingToday));
    // TODO: expect shared denied state; no patient name/address rendered.
    await expect(page.getByText("Fixture Patient A")).toHaveCount(0);
  });

  test("pre-accept request shows locality/PIN only", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.requests);
    await expect(page.getByText("Synthetic Nagar").first()).toBeVisible();
    await expect(page.getByText("Fixture Patient A")).toHaveCount(0);
    await expect(page.getByText("+910000000000")).toHaveCount(0);
  });

  test("accept conflict refreshes and explains no double booking", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: open request in two tabs, accept in one, accept in the other -> conflict message + refreshed state.
  });
});

test.describe.skip("DC02 arrival code form", () => {
  test("en route -> arrived -> code form with expiry, attempts and resend", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.visit(I.bookingToday));
    // TODO: click On the way, Arrived; expect a 6-digit input (inputmode numeric), attempts left, resend disabled until cooldown.
  });

  test("wrong code decrements attempts; lock after limit; replay denied", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: enter 999999 repeatedly; expect attempts message, then locked state; verify input cleared after each submit.
  });

  test("the code is never stored in the browser", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.visit(I.bookingToday));
    await expectNoPhiInUrlOrStorage(page);
  });
});

test.describe.skip("DC03 timeline freshness", () => {
  test("offline shows 'Last updated', reconnect refetches", async ({ page, context }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.visit(I.bookingActive));
    await context.setOffline(true);
    // TODO: expect stale/last-updated banner (aria-live polite).
    await context.setOffline(false);
    // TODO: expect refreshed status.
  });
});

test.describe.skip("DC04-DC08 consultation editor", () => {
  test("five steps in order, back/next keep entered values", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.consultation(I.bookingActive));
    await expectSyntheticNotice(page);
    // TODO: step rail Vitals, Assessment, Prescription & tests, Care & follow-up, Review & sign.
  });

  test("DC04 temperature requires a unit and keeps the entered value", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.consultation(I.bookingActive));
    // TODO: enter 101.3 without unit -> field error; choose F -> review shows 101.3 F unchanged.
  });

  test("DC05 status moves Unsaved -> Saving -> Saved; offline shows Offline; storage stays clean", async ({ page, context }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.consultation(I.bookingActive));
    // TODO: type in chief complaint; expect status live region text sequence.
    await context.setOffline(true);
    // TODO: expect Offline; no network calls queued.
    await context.setOffline(false);
    await expectNoPhiInUrlOrStorage(page);
  });

  test("DC05 conflict stops autosave and offers keep mine / use server version", async ({ page, browser }) => {
    await signInAsFixtureDoctor(page);
    const second = await browser.newPage();
    await signInAsFixtureDoctor(second);
    // TODO: edit and save in `second`, then edit in `page` -> Conflict dialog listing changed steps.
    await second.close();
  });

  test("DC06 provisional assessment completes without a definitive diagnosis", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: chief complaint + provisional + uncertainty note -> review has no missing assessment fields.
  });

  test("DC08 explicit no-medicine option; medicines require allergy review", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: choose 'No medicine prescribed' -> valid. Add a line -> allergy review required; switching back asks to confirm discarding lines.
  });

  test("DC07 review and sign, then read-only with amendment entry", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: sign disabled until saved+complete; error summary focuses first missing field; sign -> read-only record with author/time/version.
  });

  test("mobile sticky actions never cover error text or the focused field", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signInAsFixtureDoctor(page);
    await page.goto(path.consultation(I.bookingActive));
    // TODO: focus last field, assert its bounding box is above the sticky bar.
  });
});

test.describe.skip("DC09-DC14 records, collection, facts, proof, photo, PDF", () => {
  test("DC10 unpaid visit can be signed; collection form records cash separately", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: record cash 800.00 INR -> collection badge 'Recorded', payment badge stays 'Due'.
  });

  test("DC11 facts show Patient entered until reviewed; confirm only selected", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: select blood group only, add evidence note, confirm -> that fact 'Doctor verified', allergy still 'Patient entered'.
  });

  test("DC12 proof QR shows expiry; revoked token page shows revoked, no PHI", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: generate proof, regenerate -> first token verification page shows revoked; page text has no patient markers.
  });

  test("DC13 decline photo consent does not block signing; no camera before consent", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    // TODO: decline -> upload control absent; sign still enabled when complete.
  });

  test("DC14 PDF for signed version only; expired link offers a new one", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.record(I.consultationPastFinal));
    // TODO: request link -> download available; after expiry -> 'Link expired, get a new link'.
  });

  test("DC09 draft consultation is not reachable through the record route", async ({ page }) => {
    await signInAsFixtureDoctor(page);
    await page.goto(path.record(I.consultationActive));
    // TODO: expect not-found state.
  });
});

test.describe.skip("clinical gate off", () => {
  test("consultation route shows GateNotice and fetches no clinical data", async ({ page }) => {
    // Requires a server started WITHOUT FEATURE_CLINICAL=true.
    await signInAsFixtureDoctor(page);
    const clinicalRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/consultations/")) clinicalRequests.push(r.url());
    });
    await page.goto(path.consultation(I.bookingActive));
    // TODO: expect GateNotice.
    expect(clinicalRequests).toEqual([]);
  });
});
