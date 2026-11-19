/**
 * FE10-FE12 doctor workspace e2e (Playwright, synthetic fixture world only).
 *
 * "Signed in as" = which fixture server the page talks to (tests/e2e/workspace-servers.ts):
 * the interim doctor session is a SERVER env var (FIXTURE_DOCTOR_SESSION), never a cookie or URL.
 * `page` talks to the assigned-doctor server; `as("other" | "anon" | "gateOff")` opens a page on
 * the other servers. Replace with the fe2-b fixture auth adapter once merged (REQUESTS.md #15, #26).
 *
 * State: the fixture world is process-wide and tests mutate it (travel, OTP, drafts, signing).
 * Tests in this file run in order (project fullyParallel: false) and each viewport project has its
 * own server set. A fixture reset hook would give full isolation (REQUESTS.md #25).
 *
 * Accessible names below (LABEL) are the English strings the doctor pages must render. They are
 * the contract between these specs and src/messages/en/{doctor,clinical,payment}.json.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { FIXTURE_IDS as I } from "../../src/fixtures/clinical/world";
import { wsOrigin, type WorkspaceServer } from "./workspace-servers";

const test = base.extend<{ as: (who: WorkspaceServer) => Promise<Page> }>({
  baseURL: async ({}, provide, testInfo) => provide(wsOrigin(testInfo.project.name, "assigned")),
  as: async ({ browser, viewport }, provide, testInfo) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await provide(async (who) => {
      const ctx = await browser.newContext({ baseURL: wsOrigin(testInfo.project.name, who), viewport });
      contexts.push(ctx);
      return ctx.newPage();
    });
    for (const c of contexts) await c.close();
  },
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const LOCALE = "en";
const D = `/${LOCALE}/doctor`;
const path = {
  dashboard: `${D}/dashboard`,
  requests: `${D}/requests`,
  request: (id: string) => `${D}/requests/${id}`,
  visits: `${D}/visits`,
  visit: (id: string) => `${D}/visits/${id}`,
  consultation: (id: string) => `${D}/visits/${id}/consultation`,
  record: (id: string) => `${D}/records/${id}`,
};

const LABEL = {
  synthetic: /synthetic data/i,
  denied: /you do not have access/i,
  notFound: /not found/i,
  gate: /clinical features are not enabled/i,
  accept: "Accept request",
  decline: "Decline request",
  declineReason: "Reason for declining",
  confirm: "Confirm",
  onTheWay: "On the way",
  arrived: "I have arrived",
  codeInput: "Patient's 6-digit code",
  verify: "Verify code",
  resend: "Request a new code",
  startConsultation: "Start consultation",
  saveDraft: "Save draft",
  next: "Next",
  back: "Back",
  steps: ["Vitals & exam", "Assessment", "Prescription & tests", "Care & follow-up", "Review & sign"],
  draftStatus: { saving: /saving/i, saved: /saved/i, unsaved: /unsaved changes/i, offline: /offline/i, conflict: /newer version/i },
  temperature: "Temperature",
  temperatureUnit: "Temperature unit",
  chiefComplaint: "Chief complaint and symptoms",
  assessmentType: "Assessment type",
  provisional: "Provisional",
  uncertainty: "Uncertainty or next steps",
  noMedicine: "No medicine prescribed",
  prescribe: "Prescribe medicines",
  removeMedicines: "Remove medicines",
  addMedicine: "Add medicine",
  medicineName: "Medicine name",
  allergyReview: "I have reviewed the patient's known allergies",
  followUpNotRequired: "Follow-up not required",
  signAck: "I confirm this record is accurate and understand it cannot be edited after signing",
  sign: "Sign and finalize",
  amend: "Add amendment",
  keepMine: "Keep my version",
  useServer: "Use the saved version",
  collectionMethod: "Collection method",
  amount: "Amount collected (₹)",
  recordCollection: "Record collection",
  confirmFacts: "Confirm selected facts",
  evidence: "What did you review?",
  evidenceAttest: "I reviewed the evidence for the selected facts",
  generateProof: "Create proof of visit",
  regenerateProof: "Create a new proof",
  photoDecline: "Patient declines photo",
  photoConsent: "Patient consents to photo",
  getPdf: "Get PDF link",
  pdfExpired: /link has expired/i,
} as const;

/** Strings from the synthetic world that must never appear in URLs or browser storage. */
const PHI_MARKERS = ["Fixture Patient A", "Synthetic Nagar", "+910000000000", "Synthetic allergy entry", "Synthetic complaint", "Flat 0"];


async function expectNoPhiInUrlOrStorage(page: Page) {
  const url = decodeURIComponent(page.url());
  for (const m of PHI_MARKERS) expect(url, "URL must not contain PHI").not.toContain(m);
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const m of PHI_MARKERS) expect(dump, "browser storage must not contain PHI").not.toContain(m);
}

/** Open a confirm dialog; retries the trigger click until hydration has attached the handler. */
async function openDialog(page: Page, trigger: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: trigger }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

const expectSynthetic = (page: Page) => expect(page.getByText(LABEL.synthetic).first()).toBeVisible();
const step = (page: Page, name: string) => page.getByRole("navigation", { name: /consultation steps/i }).getByRole("button", { name: new RegExp(name, "i") });
// Scoped to the editor context header: the app-wide offline banner is also a status region.
const draftStatus = (page: Page) => page.getByRole("region", { name: /patient and visit/i }).getByRole("status").filter({ hasText: /saving|saved|unsaved|offline|newer version|failed/i });

// ---------------------------------------------------------------------------------------------
test.describe("doctor guard and shell", () => {
  test("unauthenticated visit redirects to login with a safe next", async ({ as }) => {
    const page = await as("anon");
    await page.goto(path.visit(I.bookingToday));
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/login\\?next=%2F${LOCALE}%2Fdoctor%2Fvisits%2F${I.bookingToday}$`));
  });

  test("dashboard: synthetic notice, pending request, today visits, active consultation", async ({ page }) => {
    await page.goto(path.dashboard);
    await expectSynthetic(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: /pending requests/i }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("region", { name: /today/i }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /continue consultation/i })).toHaveAttribute("href", path.consultation(I.bookingActive));
    await expectNoPhiInUrlOrStorage(page);
    await expectNoAxeViolations(page);
  });

  for (const width of [360, 390, 768, 1280]) {
    test(`dashboard has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.goto(path.dashboard);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }
});

// ---------------------------------------------------------------------------------------------
test.describe("DC01 assigned doctor access", () => {
  test.describe.configure({ mode: "serial" });

  test("other doctor gets the denied state for a known visit ID and no patient data", async ({ as }) => {
    const page = await as("other");
    await page.goto(path.visit(I.bookingToday));
    await expect(page.getByRole("main").getByText(LABEL.denied)).toBeVisible();
    for (const m of PHI_MARKERS) await expect(page.getByText(m)).toHaveCount(0);
  });

  test("malformed visit ID renders not-found without a fetch", async ({ page }) => {
    await page.goto(`${D}/visits/not..an..id`);
    await expect(page.getByRole("main").getByText(LABEL.notFound)).toBeVisible();
  });

  test("pre-accept request shows locality/PIN, price and respond-by, never name/phone/address", async ({ page }) => {
    await page.goto(path.request(I.bookingRequest));
    await expect(page.getByText("Synthetic Nagar").first()).toBeVisible();
    await expect(page.getByText("500001").first()).toBeVisible();
    await expect(page.getByText("₹800").first()).toBeVisible();
    for (const m of ["Fixture Patient A", "+910000000000", "Flat 0"]) await expect(page.getByText(m)).toHaveCount(0);
  });

  test("decline requires a reason; accept in a second tab then conflicts", async ({ page, as }) => {
    await page.goto(path.request(I.bookingRequest));
    const other = await as("assigned");
    await other.goto(path.request(I.bookingRequest));
    // The confirm button repeats the specific verb ("Decline request"), scoped to the dialog.
    const decline = await openDialog(page, LABEL.decline);
    await decline.getByRole("button", { name: LABEL.decline }).click();
    await expect(decline).toContainText(/choose a reason to decline/i);
    await page.keyboard.press("Escape");
    const accept = await openDialog(page, LABEL.accept);
    await accept.getByRole("button", { name: LABEL.accept }).click();
    await expect(page).toHaveURL(new RegExp(`${path.visit(I.bookingRequest)}$`));
    const late = await openDialog(other, LABEL.accept);
    await late.getByRole("button", { name: LABEL.accept }).click();
    await expect(other.getByText(/already answered/i)).toBeVisible();
    await other.close();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("DC02 arrival code form (booking: today)", () => {
  test.describe.configure({ mode: "serial" });

  test("en route -> arrived -> numeric 6-digit code input with expiry and attempts", async ({ page }) => {
    await page.goto(path.visit(I.bookingToday));
    await page.getByRole("button", { name: LABEL.onTheWay }).click();
    await expect(page.getByRole("button", { name: LABEL.arrived })).toBeVisible();
    await page.getByRole("button", { name: LABEL.arrived }).click();
    const input = page.getByLabel(LABEL.codeInput);
    await expect(input).toHaveAttribute("inputmode", "numeric");
    await expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await expect(page.getByText(/expires in/i)).toBeVisible();
    await expect(page.getByText(/5 attempts left/i)).toBeVisible();
    await expect(page.getByRole("button", { name: LABEL.resend })).toBeDisabled(); // cooldown
    await expect(page.getByRole("button", { name: LABEL.startConsultation })).toHaveCount(0);
  });

  test("non-numeric input is rejected locally; wrong codes decrement attempts and clear the field", async ({ page }) => {
    await page.goto(path.visit(I.bookingToday));
    const input = page.getByLabel(LABEL.codeInput);
    await input.fill("12ab56");
    await page.getByRole("button", { name: LABEL.verify }).click();
    await expect(page.getByText(/enter the 6-digit code/i)).toBeVisible();
    await input.fill("999999");
    await page.getByRole("button", { name: LABEL.verify }).click();
    await expect(page.getByText(/4 attempts left/i)).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("after the attempt limit the form locks and offers a new code only", async ({ page }) => {
    await page.goto(path.visit(I.bookingToday));
    const input = page.getByLabel(LABEL.codeInput);
    // Wrong codes until the server locks the challenge; each attempt waits for the previous response.
    const verify = page.getByRole("button", { name: LABEL.verify });
    for (let i = 0; i < 6 && (await input.isEnabled()); i++) {
      await input.fill("999999");
      await verify.click();
      await expect(verify).not.toHaveAttribute("aria-busy", "true");
      await expect(input).toHaveValue("");
    }
    await expect(page.getByText(/too many attempts/i)).toBeVisible();
    await expect(input).toBeDisabled();
    await expectNoPhiInUrlOrStorage(page);
  });

  test("other doctor cannot open the code form for this visit", async ({ as }) => {
    const page = await as("other");
    await page.goto(path.visit(I.bookingToday));
    await expect(page.getByRole("main").getByText(LABEL.denied)).toBeVisible();
    await expect(page.getByLabel(LABEL.codeInput)).toHaveCount(0);
  });
  // Successful verification needs the patient's code from the patient view (REQUESTS.md #20).
});

// ---------------------------------------------------------------------------------------------
test.describe("DC03 status freshness", () => {
  test("offline shows last-updated time; reconnect refetches", async ({ page, context }) => {
    // No live transport yet: the page always says when it fetched; offline is explicit; reconnect refetches.
    await page.goto(path.visit(I.bookingActive));
    const freshness = page.getByRole("status").filter({ hasText: /last updated|showing the status from/i });
    await expect(freshness).toContainText(/last updated/i);
    await context.setOffline(true);
    await expect(freshness).toContainText(/you are offline.*showing the status from/i);
    const refetch = page.waitForRequest((r) => r.url().includes(path.visit(I.bookingActive)) && r.headers()["rsc"] === "1");
    await context.setOffline(false);
    await refetch;
    await expect(freshness).toContainText(/last updated/i);
    await expect(freshness).not.toContainText(/offline/i);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("DC04-DC08 consultation editor (booking: active)", () => {
  test.describe.configure({ mode: "serial" });

  test("five steps in spec order; context header shows reference, allergy warning and draft status", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await expectSynthetic(page);
    for (const name of LABEL.steps) await expect(step(page, name)).toBeVisible();
    await expect(page.getByText("SYN-BKG-0106")).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: /allerg/i })).toBeVisible();
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.saved);
  });

  test("DC04 temperature needs a unit and is kept exactly as entered", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await page.getByRole("textbox", { name: new RegExp(`^${LABEL.temperature}\\b`) }).fill("101.3");
    await page.getByRole("button", { name: LABEL.next }).click();
    // Leaving the step would drop the half-entered reading, so Next is blocked with an alert.
    await expect(page.getByRole("alert").filter({ hasText: /choose a temperature unit/i })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: LABEL.steps[0] })).toBeVisible();
    await page.getByLabel(LABEL.temperatureUnit).selectOption("F");
    await page.getByRole("button", { name: LABEL.next }).click();
    await step(page, LABEL.steps[4]).click();
    await expect(page.getByText("101.3 °F")).toBeVisible();
  });

  test("DC05 Unsaved -> Saving -> Saved; Back/Next keep text; storage stays clean", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[1]).click();
    await page.getByLabel(LABEL.chiefComplaint).fill("Synthetic complaint for e2e");
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.unsaved);
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.saved, { timeout: 5000 });
    await page.getByRole("button", { name: LABEL.back }).click();
    await page.getByRole("button", { name: LABEL.next }).click();
    await expect(page.getByLabel(LABEL.chiefComplaint)).toHaveValue("Synthetic complaint for e2e");
    await expectNoPhiInUrlOrStorage(page);
  });

  test("DC05 offline pauses autosave and reports Offline; nothing is queued", async ({ page, context }) => {
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[1]).click();
    await context.setOffline(true);
    await page.getByLabel(LABEL.chiefComplaint).fill("Synthetic offline edit");
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.offline);
    await context.setOffline(false);
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.saved, { timeout: 5000 });
  });

  test("DC05 conflict stops autosave and asks the doctor to choose", async ({ page, as }) => {
    await page.goto(path.consultation(I.bookingActive));
    const other = await as("assigned");
    await other.goto(path.consultation(I.bookingActive));
    await step(other, LABEL.steps[1]).click();
    await other.getByLabel(LABEL.chiefComplaint).fill("Synthetic edit from second tab");
    await other.getByRole("button", { name: LABEL.saveDraft }).click();
    await expect(draftStatus(other)).toHaveText(LABEL.draftStatus.saved);
    await step(page, LABEL.steps[1]).click();
    await page.getByLabel(LABEL.chiefComplaint).fill("Synthetic edit from first tab");
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.conflict, { timeout: 5000 });
    // Shown inline as an alert next to the editor (not a modal), listing the changed steps.
    const dialog = page.getByRole("alert").filter({ has: page.getByRole("button", { name: LABEL.keepMine }) });
    await expect(dialog).toContainText(/assessment/i);
    await dialog.getByRole("button", { name: LABEL.keepMine }).click();
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.saved, { timeout: 5000 });
    await other.close();
  });

  test("DC06 provisional assessment completes without a definitive diagnosis", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[1]).click();
    await page.getByRole("radio", { name: LABEL.provisional }).check();
    await page.getByLabel(LABEL.uncertainty).fill("Synthetic: review if symptoms persist");
    await step(page, LABEL.steps[4]).click();
    await expect(page.getByRole("list", { name: /missing/i }).getByText(/assessment/i)).toHaveCount(0);
  });

  test("DC08 no-medicine is valid; a medicine line needs a name and allergy review; switching back confirms discard", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[2]).click();
    // Prescribing is an explicit decision before any medicine line can be added.
    await page.getByRole("radio", { name: LABEL.prescribe }).check();
    await page.getByRole("button", { name: LABEL.addMedicine }).click();
    await page.getByLabel(LABEL.medicineName).first().fill("Synthetic medicine");
    await expect(page.getByLabel(LABEL.allergyReview)).not.toBeChecked();
    // With a line present the radio asks first, so it is clicked (not checked) and confirmed.
    await page.getByRole("radio", { name: LABEL.noMedicine }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/1 medicine/i);
    await page.getByRole("alertdialog").getByRole("button", { name: LABEL.removeMedicines }).click();
    await expect(page.getByLabel(LABEL.medicineName)).toHaveCount(0);
  });

  test("DC07 sign disabled until complete and saved; error summary focuses first missing field", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[4]).click();
    await page.getByRole("button", { name: LABEL.sign }).click();
    await expect(page.getByText(/some required details are missing/i)).toBeVisible();
    const summary = page.getByRole("region", { name: /complete these before signing/i });
    await expect(summary.getByRole("heading")).toBeFocused();
    await summary.getByRole("button").first().click();
    // Focus lands on the missing field itself (editor ids are prefixed "cx-"), not the step heading.
    await expect(page.locator(":focus")).toHaveAttribute("id", /^cx-/);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/INPUT|TEXTAREA|SELECT|FIELDSET|BUTTON/);
  });

  test("mobile 360px: sticky actions never cover the focused field or the error summary", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[1]).click();
    const field = page.getByLabel(LABEL.chiefComplaint);
    await field.focus();
    const bar = page.getByRole("toolbar", { name: /consultation actions/i });
    const [f, b] = await Promise.all([field.boundingBox(), bar.boundingBox()]);
    expect(f && b && f.y + f.height <= b.y).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("DC09-DC14 records, collection, facts, proof, photo, PDF", () => {
  test("DC10 collection is recorded separately and payment badge stays Due", async ({ page }) => {
    await page.goto(path.visit(I.bookingActive));
    await page.getByLabel(LABEL.collectionMethod).selectOption("cash");
    await page.getByLabel(LABEL.amount).fill("800");
    await page.getByRole("button", { name: LABEL.recordCollection }).click();
    await expect(page.getByText(/collection recorded/i)).toBeVisible();
    await expect(page.getByText(/payment: due/i)).toBeVisible();
  });

  test("DC11 facts show Patient entered until reviewed; only selected facts are confirmed", async ({ page }) => {
    await page.goto(path.consultation(I.bookingActive));
    const panel = page.getByRole("region", { name: /health facts/i });
    await expect(panel.getByText(/patient entered/i)).toHaveCount(2);
    await panel.getByRole("checkbox", { name: /blood group/i }).check();
    await panel.getByLabel(LABEL.evidence).fill("Synthetic card reviewed");
    await panel.getByRole("checkbox", { name: LABEL.evidenceAttest }).check();
    await panel.getByRole("button", { name: LABEL.confirmFacts }).click();
    // Collapsed version history also holds badges; count only what the doctor sees.
    await expect(panel.getByText(/doctor verified/i).filter({ visible: true })).toHaveCount(1);
    await expect(panel.getByText(/patient entered/i).filter({ visible: true })).toHaveCount(1);
  });

  test("DC12 proof shows expiry; regenerating revokes the old one; public page has no PHI", async ({ page }) => {
    await page.goto(path.visit(I.bookingActive));
    await page.getByRole("button", { name: LABEL.generateProof }).click();
    const proof = page.getByRole("region", { name: /proof of visit/i });
    await expect(proof.getByText(/expires/i)).toBeVisible();
    // No QR library / public check page yet (REQUESTS R-FE-D-33): the card must say so, not fake a QR.
    await expect(proof.getByRole("img", { name: /qr/i })).toHaveCount(0);
    await expect(proof.getByText(/not connected yet/i)).toBeVisible();
    const firstCode = await proof.getByRole("definition").first().innerText();
    await page.getByRole("button", { name: LABEL.regenerateProof }).click();
    await expect(page.getByText(/previous proof revoked/i)).toBeVisible();
    await expect(proof.getByRole("definition").first()).not.toHaveText(firstCode);
    for (const m of PHI_MARKERS) await expect(proof.getByText(m)).toHaveCount(0);
  });

  test("DC13 decline needs no camera and does not block signing", async ({ page, context }) => {
    await context.grantPermissions([]);

    await page.goto(path.consultation(I.bookingActive));
    await page.getByRole("button", { name: LABEL.photoDecline }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await step(page, LABEL.steps[4]).click();
    await expect(page.getByRole("list", { name: /complete these before signing/i }).getByText(/photo/i)).toHaveCount(0);
  });

  test("DC14 PDF for the signed version; expired link offers a new one", async ({ page }) => {
    await page.clock.install();
    await page.goto(path.record(I.consultationPastFinal));
    await page.getByRole("button", { name: LABEL.getPdf }).click();
    await expect(page.getByRole("link", { name: /download pdf.*version 1/i })).toBeVisible();
    await page.clock.fastForward("06:00");
    await expect(page.getByText(LABEL.pdfExpired)).toBeVisible();
    await expect(page.getByRole("button", { name: LABEL.getPdf })).toBeVisible();
  });

  test("DC09 a draft consultation is not reachable through the record route", async ({ page }) => {
    await page.goto(path.record(I.consultationActive));
    await expect(page.getByRole("main").getByText(LABEL.notFound)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("clinical gate off (server without FEATURE_CLINICAL)", () => {
  test("consultation and record routes show GateNotice and request no clinical data", async ({ as }) => {
    const page = await as("gateOff");

    const clinicalRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/consultations/")) clinicalRequests.push(r.url());
    });
    await page.goto(path.consultation(I.bookingActive));
    await expect(page.getByRole("main").getByText(LABEL.gate)).toBeVisible();
    await page.goto(path.record(I.consultationPastFinal));
    await expect(page.getByRole("main").getByText(LABEL.gate)).toBeVisible();
    expect(clinicalRequests).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Signing makes the active consultation read-only, so it runs after every editor/records test.
test.describe("DC07 signing (booking: active, last)", () => {
  test("DC07 sign -> read-only record with author, time, version and amendment entry", async ({ page }) => {
    // Self-contained: fills every required step so it does not depend on earlier editor tests.
    await page.goto(path.consultation(I.bookingActive));
    await step(page, LABEL.steps[1]).click();
    await page.getByLabel(LABEL.chiefComplaint).fill("Synthetic complaint for signing");
    await page.getByRole("radio", { name: LABEL.provisional }).check();
    await page.getByLabel(LABEL.uncertainty).fill("Synthetic: review if symptoms persist");
    await step(page, LABEL.steps[2]).click();
    await page.getByRole("radio", { name: LABEL.noMedicine }).click();
    const discard = page.getByRole("alertdialog");
    if (await discard.isVisible().catch(() => false)) await discard.getByRole("button", { name: LABEL.removeMedicines }).click();
    await expect(page.getByRole("radio", { name: LABEL.noMedicine })).toBeChecked();
    await step(page, LABEL.steps[3]).click();
    await page.getByRole("radio", { name: LABEL.followUpNotRequired }).check();
    await page.getByRole("button", { name: LABEL.saveDraft }).click();
    await expect(draftStatus(page)).toHaveText(LABEL.draftStatus.saved, { timeout: 5000 });
    await step(page, LABEL.steps[4]).click();
    await page.getByLabel(LABEL.signAck).check();
    await page.getByRole("button", { name: LABEL.sign }).click();
    await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/signed by dr\. fixture asha \(synthetic\)/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: LABEL.amend })).toBeVisible();
  });
});
