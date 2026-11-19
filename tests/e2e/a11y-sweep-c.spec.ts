import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * R8-C/R9-C accessibility sweep over every route fe-c owns: the public doctor directory and profiles (/doctors/**),
 * the doctor booking journey (/patient/book/**) and the
 * lab, caretaker and ambulance request trees, in their normal, empty, error-free gated and missing-input states.
 * Each visit, at 390px and 1280px (Playwright projects): axe has no serious or critical violation, the page does
 * not scroll sideways, and the first Tab stop shows a visible focus indicator. Fixture adapter only.
 */
const FIXTURE = process.env.FRONTEND_ADAPTER === "fixture";
test.skip(!FIXTURE, "needs the synthetic fixture adapter");

const DOCTOR_1 = "providerId=00000000-0000-4000-8000-000000000001&serviceId=00000000-0000-4000-8001-000000000001";
const DOCTOR_3 = "providerId=00000000-0000-4000-8000-000000000102&serviceId=00000000-0000-4000-8001-000000000102";
const PAID_BOOKING = "00000000-0000-4000-8000-000000000071";
const LAB = (n: number) => `00000000-0000-4000-8200-00000000000${n}`;
const CARE = (n: number) => `00000000-0000-4000-8300-00000000000${n}`;
const AMB = (n: number) => `00000000-0000-4000-8400-00000000000${n}`;

async function sweep(page: Page, label: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = results.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(serious.map(v => `${label}: ${v.id} (${v.impact}) ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: horizontal scroll`).toBe(true);
  // No browser storage and only public filters or ids in the query string.
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length]), `${label}: browser storage used`).toEqual([0, 0]);
  const keys = [...new URL(page.url()).searchParams.keys()].filter(key => !["providerId", "serviceId", "pin", "speciality", "sort", "showFull", "availability", "next", "test", "city"].includes(key));
  expect(keys, `${label}: unexpected query parameters`).toEqual([]);
  // First Tab stop from the top of the page: it must be on screen and show a focus indicator.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      name: `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 40) ?? ""}`,
      ring: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || (style.boxShadow !== "none" && style.boxShadow !== ""),
      onScreen: box.width > 1 && box.height > 1 && box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth,
    };
  });
  expect(focus, `${label}: nothing took focus on the first Tab`).not.toBeNull();
  expect(focus?.ring, `${label}: first Tab stop "${focus?.name}" has no visible focus ring`).toBe(true);
  expect(focus?.onScreen, `${label}: first Tab stop "${focus?.name}" is off screen`).toBe(true);
}

const STATIC_ROUTES: [string, string, RegExp | string][] = [
  ["doctors: directory", "/en/doctors", "Find a doctor"],
  ["doctors: speciality filter", "/en/doctors?speciality=paediatrics", "Find a doctor"],
  ["doctors: full list sorted", "/en/doctors?showFull=1&sort=fee_asc", "Find a doctor"],
  ["doctors: profile", "/en/doctors/00000000-0000-4000-8000-000000000001", "Synthetic doctor 1"],
  ["doctors: fully booked profile", "/en/doctors/00000000-0000-4000-8000-000000000102", "No open slots right now"],
  ["doctors: unknown profile", "/en/doctors/00000000-0000-4000-8000-000000009999", /./],
  ["te: doctors directory", "/te/doctors", /./],
  ["hi: doctors directory", "/hi/doctors", /./],
  ["te: doctor profile", "/te/doctors/00000000-0000-4000-8000-000000000001", "Synthetic doctor 1"],
  ["hi: doctor profile", "/hi/doctors/00000000-0000-4000-8000-000000000001", "Synthetic doctor 1"],
  ["labs: directory", "/en/lab-tests", "Find a lab test"],
  ["labs: test filter", "/en/lab-tests?test=blood", "Matching tests"],
  ["labs: test and city", "/en/lab-tests?test=blood&city=Secunderabad", "1 lab"],
  ["labs: invalid test", "/en/lab-tests?test=x", "Enter at least 2 characters of the test name."],
  ["labs: no match", "/en/lab-tests?test=zzzz", "No lab matches these filters"],
  ["labs: detail", "/en/lab-tests/00000000-0000-4000-8200-000000000001", "Tests offered"],
  ["labs: unknown lab", "/en/lab-tests/00000000-0000-4000-8200-000000000099", "This lab is not listed"],
  ["te: labs directory", "/te/lab-tests", "ల్యాబ్ పరీక్షను వెతకండి"],
  ["hi: lab detail", "/hi/lab-tests/00000000-0000-4000-8200-000000000001", "उपलब्ध जाँचें"],
  ["book: no doctor", "/en/patient/book", "Choose a doctor first"],
  ["book: wizard", `/en/patient/book?${DOCTOR_1}`, "Request a visit with Synthetic doctor 1"],
  ["book: not bookable", `/en/patient/book?${DOCTOR_3}`, "This doctor cannot take requests right now"],
  ["book: completed request", `/en/patient/book/${PAID_BOOKING}`, "Visit completed"],
  ["book: receipt", `/en/patient/book/${PAID_BOOKING}/receipt`, "This receipt confirms payment to the doctor. It is not a tax invoice."],
  ["lab: list", "/en/patient/lab-tests", "Lab tests at home"],
  ["lab: invalid PIN", "/en/patient/lab-tests?pin=12", "Enter a 6-digit PIN code that does not start with 0."],
  ["lab: empty PIN", "/en/patient/lab-tests?pin=600001", "No providers serve this PIN yet"],
  ["lab: form", `/en/patient/lab-tests/request?providerId=${LAB(1)}`, "Request tests from Synthetic lab 1"],
  ["lab: no covered address", `/en/patient/lab-tests/request?providerId=${LAB(3)}`, "None of your saved addresses is in this area"],
  ["lab: no provider", "/en/patient/lab-tests/request", "Choose a provider first"],
  ["care: list", "/en/patient/caretakers", "Caretakers at home"],
  ["care: form", `/en/patient/caretakers/request?providerId=${CARE(1)}`, "Request care from Synthetic caretaker 1"],
  ["care: no covered address", `/en/patient/caretakers/request?providerId=${CARE(3)}`, "None of your saved addresses is in this area"],
  ["care: unknown provider", `/en/patient/caretakers/request?providerId=${CARE(9)}`, "Choose a provider first"],
  ["ambulance: list", "/en/patient/ambulance", "Scheduled ambulance transfer"],
  ["ambulance: form", `/en/patient/ambulance/request?providerId=${AMB(1)}`, "Request a transfer from Synthetic transfer operator 1"],
  ["ambulance: no provider", "/en/patient/ambulance/request", "Choose a provider first"],
  ["te: lab list", "/te/patient/lab-tests", "ఇంటి వద్ద ల్యాబ్ పరీక్షలు"],
  ["hi: ambulance list", "/hi/patient/ambulance", "पहले से तय एम्बुलेंस स्थानांतरण"],
];

test.describe("a11y sweep: fe-c routes", () => {
  for (const [label, path, marker] of STATIC_ROUTES) {
    test(label, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(marker).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
      if (path.includes("/patient/ambulance")) await expect(page.getByTestId("emergency-banner").filter({ visible: true }).first()).toBeVisible();
      await sweep(page, label);
    });
  }

  test("status pages: lab, caretaker and ambulance requests", async ({ page }, info) => {
    test.setTimeout(180_000);
    const col = info.project.name === "mobile-390" ? 1 : -2;
    const pick = async () => {
      const days = page.getByRole("group", { name: "Day", exact: true }).locator("label");
      await expect(days.first()).toBeVisible({ timeout: 15_000 });
      await days.nth(Math.min(3, (await days.count()) - 1)).click();
      const times = page.getByRole("group", { name: /^Time on / }).locator("label");
      const count = await times.count();
      await times.nth(col < 0 ? Math.max(0, count + col) : Math.min(col, count - 1)).click();
    };
    const send = async (url: RegExp) => {
      await page.getByRole("checkbox", { name: "I accept the price and the cancellation policy." }).check();
      await page.getByRole("button", { name: "Send request" }).click();
      await expect(page).toHaveURL(url, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible({ timeout: 15_000 });
    };

    await page.goto(`/en/patient/lab-tests/request?providerId=${LAB(1)}`);
    await page.getByRole("checkbox", { name: /Urine routine/ }).check();
    await pick();
    await page.getByRole("checkbox", { name: "I will follow the preparation shown for these tests." }).check();
    await send(/\/patient\/lab-tests\/requests\//);
    await sweep(page, "lab: status");

    await page.goto(`/en/patient/caretakers/request?providerId=${CARE(1)}`);
    await page.getByRole("checkbox", { name: "Company and conversation" }).check();
    await page.getByLabel("How many hours?").selectOption("2");
    await pick();
    await page.getByRole("checkbox", { name: "I understand caretakers give non-clinical help only." }).check();
    await send(/\/patient\/caretakers\/requests\//);
    await sweep(page, "care: status");

    await page.goto(`/en/patient/ambulance/request?providerId=${AMB(1)}`);
    await page.getByRole("radio", { name: "Walks without help" }).check();
    await page.getByRole("radio", { name: /Wheelchair van/ }).check();
    const drop = page.getByRole("group", { name: "Drop-off" });
    await drop.getByLabel("Area or locality").fill("Synthetic locality B");
    await drop.getByLabel("City").fill("Hyderabad");
    await drop.getByLabel("PIN code").fill("500032");
    await pick();
    await page.getByRole("checkbox", { name: "I confirm this is a planned transfer, not an emergency." }).check();
    await send(/\/patient\/ambulance\/requests\//);
    await expect(page.getByTestId("emergency-banner").filter({ visible: true }).first()).toBeVisible();
    await sweep(page, "ambulance: status");
  });

  test("doctors: mobile filter sheet and type-ahead open", async ({ page }, info) => {
    await page.goto("/en/doctors");
    await expect(page.getByRole("heading", { level: 1, name: "Find a doctor" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("combobox", { name: "Search doctors, specialities or symptoms" }).pressSequentially("child");
    await expect(page.getByRole("listbox")).toBeVisible();
    await sweep(page, "doctors: type-ahead open");
    if (info.project.name === "mobile-390") {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Filters/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });

  test("form error states: summary and field errors", async ({ page }) => {
    for (const [label, path] of [
      ["lab: form errors", `/en/patient/lab-tests/request?providerId=${LAB(1)}`],
      ["care: form errors", `/en/patient/caretakers/request?providerId=${CARE(1)}`],
      ["ambulance: form errors", `/en/patient/ambulance/request?providerId=${AMB(1)}`],
    ] as const) {
      await page.goto(path);
      await page.getByRole("button", { name: "Send request" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /problem/ })).toBeFocused({ timeout: 15_000 });
      await sweep(page, label);
    }
  });
});
