/**
 * Shared helpers for the operations e2e specs (lab, ambulance, caretaker, admin ops, CMS).
 *
 * `signInAs` signs in through the fixture auth adapter (src/fixtures/identity/operations.ts).
 * The fixture state lives in server memory: specs that change data need a fresh server per spec file.
 * The operations fixture clock starts at 2026-11-20T06:00Z (src/modules/admin/clock.ts), so
 * stale quotes, the driver's current trip and "today" do not depend on the wall clock.
 *
 * Run (synthetic only): FRONTEND_ADAPTER=fixture APP_ENV=staging npx playwright test tests/e2e/<area>.spec.ts
 * Lab report release needs a second run against a server started with FEATURE_CLINICAL=true
 * (export it for both the server and Playwright).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { signIn } from "./identity";

export const LOCALE = "en";

/**
 * Synthetic personas. Profile IDs match src/fixtures/operations/{workspaces,admin}.ts so the
 * fixture session (auth module) can hand the guards matching memberships / admin principals.
 */
export const PERSONAS = {
  labManager: "fx-prof-lab-manager",
  labCollectorA: "fx-prof-collector-a",
  labCollectorB: "fx-prof-collector-b",
  labReviewer: "fx-prof-lab-reviewer",
  multiLabManager: "fx-prof-multi",
  ambulanceOperator: "fx-prof-amb-operator",
  driverA: "fx-prof-driver-a",
  driverB: "fx-prof-driver-b",
  agencyManager: "fx-prof-care-manager",
  caregiverA: "fx-prof-care-a",
  caregiverB: "fx-prof-care-b",
  independentCaregiver: "fx-prof-care-indep",
  adminVerifier: "fx-adm-verifier",
  adminLead: "fx-adm-super",
  adminNoGrants: "fx-adm-empty",
  adminOrgAuditor: "fx-adm-org-auditor",
  contentEditor: "fx-adm-editor",
  contentPublisher: "fx-adm-publisher",
} as const;

export type Persona = keyof typeof PERSONAS;

/**
 * English copy the specs rely on. Keep in sync with src/messages/en/{lab,ambulance,caretaker,admin,common}.json
 * when those keys are written; a copy change is then a one-line update here.
 */
export const COPY = {
  fixtureNotice: /synthetic data/i,
  accessDenied: /you do not have access/i,
  notFound: /not found|could not be found|could not find/i,
  gated: /not available yet|currently unavailable|disabled/i,
  chooseWorkspace: /choose (an )?organi[sz]ation|choose (a )?workspace/i,
  switchWorkspace: /switch (organi[sz]ation|workspace)/i,
  call112: /call 112/i,
  dispatchUnavailable: /emergency dispatch is not available/i,
  // The placeholder option also reads "Select a reason", so match the error text only.
  reasonRequired: /select a reason to continue|reason is required/i,
  errorSummary: /there (is|are) (a )?problems?|fix \d+ problems? to continue/i,
  saved: /saved/i,
  // lab
  startCollection: /start collection/i,
  markCollected: /sample collected/i,
  collectionFailed: /could not collect|collection failed|collection could not be completed/i,
  requestRecollection: /request recollection/i,
  review: /^mark reviewed$|^review$/i,
  release: /^release( report)?$/i,
  // ambulance
  accept: /^accept$/i,
  decline: /^decline$/i,
  staleQuote: /quote (has )?expired|re-?quote/i,
  setOff: /set off|departed/i,
  arrived: /^arrived|at (the )?pickup/i,
  notVerified: /not verified/i,
  // caretaker
  checkIn: /^check in$/i,
  checkOut: /^check out$/i,
  markAbsent: /mark absent|report absence/i,
  assignReplacement: /assign replacement/i,
  notSupportedYet: /not (yet )?supported|pending approval/i,
  // admin / CMS
  searchReference: /booking reference/i,
  search: /^search$/i,
  invalidReference: /enter a valid booking reference/i,
  payAfter: /pay after service|cash|upi/i,
  gateway: /online payment|gateway/i,
  refundGated: /refund approval is not available/i,
  noAdminAreas: /no admin areas|nothing assigned/i,
  allClear: /nothing needs (your )?action/i,
  saveDraft: /save draft/i,
  sendToPreview: /send to preview|submit for preview/i,
  publish: /^publish$/i,
  backToDraft: /back to draft|return to draft/i,
  htmlForbidden: /html|markup is not allowed/i,
  unsafeLink: /link (is not|isn't) allowed|unsafe link/i,
} as const;

/** Strings from the synthetic fixtures that must never appear in URLs or browser storage. */
export const PRIVATE_MARKERS = ["Fixture street", "+919000000000", "90000 00000", "482913", "fx-consent-1"];

/** Persona -> synthetic sign-in email (src/fixtures/identity/operations.ts). */
export const PERSONA_EMAILS: Record<Persona, string> = {
  labManager: "ops.lab.manager@example.invalid",
  labCollectorA: "ops.lab.collector.a@example.invalid",
  labCollectorB: "ops.lab.collector.b@example.invalid",
  labReviewer: "ops.lab.reviewer@example.invalid",
  multiLabManager: "ops.lab.multi@example.invalid",
  ambulanceOperator: "ops.ambulance.operator@example.invalid",
  driverA: "ops.ambulance.driver.a@example.invalid",
  driverB: "ops.ambulance.driver.b@example.invalid",
  agencyManager: "ops.care.manager@example.invalid",
  caregiverA: "ops.care.a@example.invalid",
  caregiverB: "ops.care.b@example.invalid",
  independentCaregiver: "ops.care.independent@example.invalid",
  adminVerifier: "ops.admin.verifier@example.invalid",
  adminLead: "ops.admin.lead@example.invalid",
  adminNoGrants: "ops.admin.nogrants@example.invalid",
  adminOrgAuditor: "ops.admin.auditor@example.invalid",
  contentEditor: "ops.content.editor@example.invalid",
  contentPublisher: "ops.content.publisher@example.invalid",
};

/** Signs in through the fixture auth adapter as this synthetic persona, then lands on `next`. */
export async function signInAs(page: Page, persona: Persona, next?: string): Promise<void> {
  await signIn(page, PERSONA_EMAILS[persona], next);
  // Load the target fresh: after the client-side sign-in redirect Next keeps the login page
  // mounted but hidden (Activity), which duplicates landmarks and text for locators.
  await page.goto(next ?? page.url(), { waitUntil: "domcontentloaded" });
  if (next) await expect(page).toHaveURL((u) => u.pathname === next.split("?")[0]);
  await settle(page);
}

/**
 * Waits until streamed Suspense content has been revealed. Until then React keeps the streamed
 * markup in hidden `<div hidden id="S:n">` segments, so CSS/test-id locators briefly see two copies.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("div[hidden][id^=\"S:\"]"), undefined, { timeout: 15_000 });
}

/** page.goto followed by `settle`. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settle(page);
}

export async function expectFixtureNotice(page: Page): Promise<void> {
  await expect(page.getByText(COPY.fixtureNotice).first()).toBeVisible();
}

export async function expectDenied(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: COPY.accessDenied })).toBeVisible();
}

export async function expectNoPrivateDataInUrlOrStorage(page: Page): Promise<void> {
  const url = decodeURIComponent(page.url());
  for (const marker of PRIVATE_MARKERS) expect(url, "URL must not contain private data").not.toContain(marker);
  const dump = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  for (const marker of PRIVATE_MARKERS) expect(dump, "browser storage must not contain private data").not.toContain(marker);
}

/** Text that suggests an ETA, countdown or live tracking. Must never render on ambulance pages. */
export const ETA_PATTERN = /\bETA\b|\b\d+\s*(min|mins|minutes)\b|arriving in|on the way|live (location|tracking)/i;

export async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
}

/** Every interactive target on the page is at least 44x44 CSS px. */
export async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.$$eval("a[href], button, input, select, textarea, [role=button]", (els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44) && !(el as HTMLElement).closest("[data-inline-link]");
      })
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(small).toEqual([]);
}

/**
 * Only the visible matches. RecordList renders every record twice (a table from md up and cards
 * below md, one of them display:none), and text locators also see the hidden copy.
 */
export const shown = (locator: Locator): Locator => locator.filter({ visible: true });

/** One record of a RecordList that contains `text`: the table row on desktop, the card on mobile. */
export function record(scope: Page | Locator, text: string | RegExp): Locator {
  return shown(scope.locator("tr, ul[aria-label] > li").filter({ hasText: text }));
}

/** A RecordList by its accessible label (table region on desktop, card list on mobile). */
export function recordList(page: Page, label: string | RegExp): Locator {
  return shown(page.getByLabel(label, { exact: typeof label === "string" }));
}

/** Confirms the open dialog. Confirm buttons repeat the action name (for example "Decline"), never a bare "Confirm". */
export async function confirmDialog(page: Page, action: string | RegExp): Promise<void> {
  await page.getByRole("alertdialog").getByRole("button", { name: action }).click();
}

/** The toast region, where a confirmed server action reports its outcome. */
export const notifications = (page: Page): Locator => page.getByRole("region", { name: /notifications/i });
