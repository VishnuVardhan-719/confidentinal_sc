/*
 * axe (zero serious/critical) plus basic page health on every route, at 390 and 1280 px.
 * App routes are visited with the demo role that owns them. The role is set through the real demo sign-in
 * once per role (stored as a Playwright storage state), not by forging the cookie.
 */
import { expect, test } from "@playwright/test";
import type { DemoRole } from "../../src/lib/demo/data";
import {
  expectDemoBadge,
  expectNoFakeClaims,
  expectNoHorizontalScroll,
  expectNoSeriousAxe,
  signInAsDemo,
  trackErrors,
} from "./helpers";

type Route = { path: string; role?: DemoRole; demo?: boolean };

const ROUTES: Route[] = [
  // Public
  { path: "/" },
  { path: "/how-it-works" },
  { path: "/categories" },
  { path: "/categories/doctor", demo: true },
  { path: "/categories/lab", demo: true },
  { path: "/categories/scheduled-ambulance", demo: true },
  { path: "/categories/caretaker" },
  { path: "/providers/demo-dr-1", demo: true },
  { path: "/providers/demo-lab-1", demo: true },
  { path: "/providers/demo-amb-1", demo: true },
  // Site pages (t28)
  { path: "/about" },
  { path: "/accessibility" },
  { path: "/contact" },
  { path: "/faq" },
  { path: "/privacy" },
  { path: "/providers" },
  { path: "/terms" },
  // Auth (t27)
  { path: "/sign-in", demo: true },
  { path: "/sign-up" },
  { path: "/forgot-password" },
  { path: "/verify" },
  { path: "/sign-out" },
  // App (t22), as the owning demo role
  { path: "/dashboard", role: "patient", demo: true },
  { path: "/book?provider=demo-dr-1&service=s1&slot=2026-12-02T04:30:00.000Z", role: "patient", demo: true },
  { path: "/account", role: "patient" },
  { path: "/provider", role: "doctor", demo: true },
  { path: "/provider/onboarding", role: "doctor" },
  { path: "/caretaker", role: "caretaker", demo: true },
  { path: "/admin", role: "admin", demo: true },
];

for (const route of ROUTES) {
  test.describe(`${route.path}${route.role ? ` (as ${route.role})` : ""}`, () => {
    test.beforeEach(async ({ page }) => {
      if (route.role) await signInAsDemo(page, route.role);
    });

    test("loads clean, one h1, no overflow, honest, axe clean", async ({ page }) => {
      const errors = trackErrors(page);
      const response = await page.goto(route.path, { waitUntil: "load" });
      expect(response?.status(), "HTTP status").toBe(200);
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { level: 1 }), "exactly one visible h1").toHaveCount(1);
      await expect(page.getByRole("main"), "one main landmark").toHaveCount(1);
      await expectNoHorizontalScroll(page);
      if (route.demo) await expectDemoBadge(page);
      await expectNoFakeClaims(page);
      await expectNoSeriousAxe(page);
      expect(errors, "console / page errors").toEqual([]);
    });
  });
}
