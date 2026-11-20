import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAs, type Persona } from "./support/operations";

/**
 * Accessibility sweep (synthetic fixture data only): every public, sign-in, operations and admin
 * page at 390 px and 1280 px. Each page must have no serious or critical axe violations
 * (WCAG 2.0/2.1 A and AA) and no horizontal scrolling. Read-only: nothing is submitted.
 */

const PUBLIC = [
  "",
  "/about",
  "/become-a-provider",
  "/contact",
  "/emergency",
  "/faq",
  "/how-it-works",
  "/memberships",
  "/our-story",
  "/privacy",
  "/refunds",
  "/stories",
  "/stories/synthetic-story-one",
  "/terms",
  "/login",
  "/signup",
  "/recover",
  "/no-such-page",
];

const AREAS: { persona: Persona; routes: string[] }[] = [
  {
    persona: "labManager",
    routes: ["dashboard", "orders", "orders/fx-lab-order-2", "collections", "reports", "catalog", "branches", "staff", "billing", "support"].map((r) => `/lab/${r}`),
  },
  {
    persona: "ambulanceOperator",
    routes: ["dashboard", "requests", "trips", "trips/fx-trip-1", "fleet", "crew", "availability", "billing", "support", "emergency"].map((r) => `/ambulance/${r}`),
  },
  { persona: "driverA", routes: ["/ambulance/driver"] },
  {
    persona: "agencyManager",
    routes: ["dashboard", "requests", "assignments", "assignments/fx-care-asg-1", "shifts", "services", "staff", "plans", "availability", "billing", "support"].map((r) => `/caretaker/${r}`),
  },
  {
    persona: "adminLead",
    routes: ["dashboard", "bookings", "users", "payments", "support", "audit", "settings"].map((r) => `/admin/${r}`),
  },
  { persona: "contentPublisher", routes: ["/admin/cms", "/admin/cms/new?kind=faq", "/admin/cms/fx-cms-story-1"] },
];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

type Finding = { path: string; problem: string };

async function audit(page: Page, path: string, findings: Finding[]): Promise<void> {
  await page.goto(`/en${path}`, { waitUntil: "load" });
  // Let streamed sections (Suspense) settle before auditing.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of results.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
    findings.push({ path, problem: `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) findings.push({ path, problem: `horizontal scroll ${overflow}px` });
}

// Width is set per test, so run this spec in a single project: --project=desktop-1280.
for (const viewport of VIEWPORTS) {
  test.describe(`a11y sweep at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("public and sign-in pages", async ({ page }) => {
      test.setTimeout(PUBLIC.length * 20_000);
      const findings: Finding[] = [];
      for (const path of PUBLIC) await audit(page, path, findings);
      expect(findings).toEqual([]);
    });

    for (const { persona, routes } of AREAS) {
      test(`${persona} workspace pages`, async ({ page }) => {
        test.setTimeout(30_000 + routes.length * 20_000);
        await signInAs(page, persona, `/en${routes[0].split("?")[0]}`);
        const findings: Finding[] = [];
        for (const path of routes) await audit(page, path, findings);
        expect(findings).toEqual([]);
      });
    }
  });
}
