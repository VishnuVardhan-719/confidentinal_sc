import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
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

/** Demo landing page per role (phase 3 workflow, step 4). */
export const DEMO_HOME: Record<DemoRole, RegExp> = {
  patient: /\/dashboard$/,
  doctor: /\/provider$/,
  lab: /\/provider$/,
  ambulance: /\/provider$/,
  caretaker: /\/caretaker$/,
  admin: /\/admin$/,
};

/**
 * Walks the client-side /book flow (owner t22) without hard-coding its fields: fills empty required text inputs
 * with synthetic values, answers unanswered radio groups and selects with their first option, then presses the
 * forward button ("Continue" / "Send request") until the confirmation shows.
 */
export async function completeBookingFlow(page: Page) {
  const forward = /^(continue|next|send request|send the request|confirm)\b/i;
  const confirmation = page.getByText(/request (sent|received)|\brequested\b/i).first();
  for (let step = 0; step < 8; step++) {
    if (await confirmation.isVisible().catch(() => false)) return;
    const main = page.locator("main");
    await fillVisibleRequired(main);
    const button = main.getByRole("button", { name: forward }).last();
    await expect(button, `/book step ${step + 1}: forward button (owner t22)`).toBeVisible();
    await button.click();
  }
  await expect(confirmation, "/book: confirmation screen (owner t22)").toBeVisible();
}

const SYNTHETIC: [RegExp, string][] = [
  [/pin/i, "500001"],
  [/mobile|phone/i, "9876543210"],
  [/e-?mail/i, "demo.user@demo.invalid"],
  [/password/i, "Demo-passw0rd-only"],
  [/birth|dob/i, "1990-01-15"],
  [/years|experience|vehicles|number of/i, "5"],
  [/fee|price|rupees|₹/i, "500"],
  [/registration|licen[cs]e|council/i, "DEMO-12345"],
  [/hours/i, "08:00-18:00"],
  [/city|base/i, "Hyderabad"],
  [/code/i, "DEMO-LINK"],
  [/name|person|operator|clinic|lab/i, "Demo Person (Demo)"],
];

/** Fills every visible, empty, required text field, radio group, checkbox group and select inside `scope`. */
export async function fillVisibleRequired(scope: Locator) {
  for (const box of await scope.locator("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea").all()) {
    if (!(await box.isVisible()) || (await box.inputValue()) !== "") continue;
    const required = (await box.getAttribute("required")) !== null || (await box.getAttribute("aria-required")) === "true";
    if (!required) continue;
    const type = (await box.getAttribute("type")) ?? "text";
    const label = await box.evaluate((el) => {
      const input = el as HTMLInputElement;
      return `${input.labels?.[0]?.textContent ?? ""} ${input.getAttribute("aria-label") ?? ""} ${input.name}`;
    });
    if (type === "date") await box.fill("2026-12-04");
    else if (type === "time") await box.fill("10:00");
    else await box.fill(SYNTHETIC.find(([re]) => re.test(label))?.[1] ?? (type === "number" ? "5" : "Demo"));
  }
  for (const group of await scope.locator("fieldset, [role=radiogroup], [role=group]").all()) {
    if (!(await group.isVisible())) continue;
    const radios = group.locator("input[type=radio]");
    if ((await radios.count()) > 0 && (await group.locator("input[type=radio]:checked").count()) === 0) {
      await radios.first().check({ force: true });
    }
    const boxes = group.locator("input[type=checkbox]");
    if ((await boxes.count()) > 1 && (await group.locator("input[type=checkbox]:checked").count()) === 0) {
      await boxes.first().check({ force: true });
    }
  }
  for (const select of await scope.locator("select").all()) {
    if (!(await select.isVisible()) || (await select.inputValue()) !== "") continue;
    const value = await select.locator("option:not([value=''])").first().getAttribute("value");
    if (value) await select.selectOption(value);
  }
}