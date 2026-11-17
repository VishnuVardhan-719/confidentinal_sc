import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { DEMO_LABEL, type DemoRole } from "../../src/lib/demo/data";

export { DEMO_LABEL };

/** Collects console errors and uncaught page errors from the moment it is attached. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Records every non-GET request to our own origin (server actions, API calls). Demo screens must make none. */
export function trackMutations(page: Page, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const seen: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET" && req.method() !== "HEAD" && req.url().startsWith(origin)) {
      seen.push(`${req.method()} ${new URL(req.url()).pathname}`);
    }
  });
  return seen;
}

/** Zero serious/critical axe violations. The message lists rule ids and targets for the page owner. */
export async function expectNoSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "document scrollWidth vs clientWidth").toBeLessThanOrEqual(cw);
}

export async function expectDemoBadge(page: Page) {
  await expect(page.getByText(DEMO_LABEL, { exact: true }).first(), `visible "${DEMO_LABEL}" badge`).toBeVisible();
}

/**
 * Owner rule: never imply real ratings, reviews, ETAs, verification or payment.
 * Negations such as "nothing on it has been verified" or "Payment: not collected" are fine, so this looks for
 * claims, not words.
 */
export async function expectNoFakeClaims(page: Page) {
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const claims: [string, RegExp][] = [
    ["star rating", /[★⭐]|\b\d(\.\d)?\s*(\/\s*5|stars?|out of 5)\b/i],
    ["ratings or reviews", /\b\d[\d,]*\s+(ratings?|reviews?)\b|\b(patient|customer|user|verified)\s+(reviews?|ratings?)\b|\brated\s+\d|\btestimonials?\b/i],
    ["ETA / arrival time", /\bETA\b|\barriv(es|ing|al)\s+(in|within)\s+\d/i],
    ["verified badge", /\b(verified|certified|trusted)\s+(doctor|provider|lab|ambulance|caretaker|profile|partner)s?\b/i],
    ["payment taken", /\b(payment\s+(successful|received|complete[d]?|confirmed)|paid\s+(in full|successfully|₹))\b/i],
    ["emergency service", /\b(emergency\s+(ambulance|dispatch|response)\s+(available|in\s+\d))\b/i],
  ];
  const found = claims.filter(([, re]) => re.test(text)).map(([name, re]) => `${name}: "${text.match(re)?.[0]}"`);
  expect(found, "fake trust/payment/ETA claims on the page").toEqual([]);
}

export const ROLE_LABEL: Record<DemoRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  caretaker: "Caretaker",
  admin: "Admin",
};

/** Demo sign-in through the real UI on /sign-in ("Try demo as <role>"). */
export async function signInAsDemo(page: Page, role: DemoRole) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`^Try demo as ${ROLE_LABEL[role]}\\b`) }).click();
}

/** Demo landing page per role (contract: t27 DEMO_HOME). */
export const DEMO_HOME: Record<DemoRole, RegExp> = {
  patient: /\/dashboard$/,
  doctor: /\/provider$/,
  lab: /\/provider$/,
  ambulance: /\/provider$/,
  caretaker: /\/provider$/,
  admin: /\/admin$/,
};
