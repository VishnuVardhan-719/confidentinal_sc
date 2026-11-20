/*
 * axe (zero serious/critical) plus basic page health on every route, at 390 and 1280 px.
 * App routes are visited signed in through the real /sign-in form against the synthetic /api (helpers.mockBackend).
 */
import { expect, test } from "@playwright/test";
import { expectNoFakeClaims, expectNoHorizontalScroll, expectNoSeriousAxe, mockBackend, signIn, trackErrors } from "./helpers";

type Route = { path: string; roles?: string[] };

const ROUTES: Route[] = [
  // Public
  { path: "/" },
  { path: "/how-it-works" },
  { path: "/categories" },
  { path: "/categories/doctor" },
  { path: "/categories/lab" },
  { path: "/categories/scheduled-ambulance" },
  { path: "/categories/caretaker" },
  // Site pages
  { path: "/about" },
  { path: "/accessibility" },
  { path: "/contact" },
  { path: "/faq" },
  { path: "/privacy" },
  { path: "/providers" },
  { path: "/terms" },
  // Auth
  { path: "/sign-in" },
  { path: "/sign-up" },
  { path: "/forgot-password" },
  { path: "/sign-out" },
  // App, signed in with the role that owns each route
  { path: "/dashboard", roles: ["patient"] },
  { path: "/book", roles: ["patient"] },
  { path: "/book?category=doctor&pin=500001&provider=SCV-DOC-900001&service=5e000000-0000-4000-8000-000000000001", roles: ["patient"] },
  { path: "/account", roles: ["patient"] },
  { path: "/provider", roles: ["patient", "doctor"] },
  { path: "/provider/onboarding", roles: ["patient", "doctor"] },
  { path: "/admin", roles: ["patient", "admin"] },
];

for (const route of ROUTES) {
  test.describe(`${route.path}${route.roles ? ` (as ${route.roles.join("+")})` : ""}`, () => {
    test("loads clean, one h1, no overflow, honest, axe clean", async ({ page }) => {
      const errors = trackErrors(page);
      await mockBackend(page, { roles: route.roles });
      if (route.roles) await signIn(page);
      const response = await page.goto(route.path, { waitUntil: "load" });
      expect(response?.status(), "HTTP status").toBe(200);
      await page.waitForLoadState("networkidle");
      if (route.roles) await expect(page.getByText("Checking your session")).toHaveCount(0);

      await expect(page.getByRole("heading", { level: 1 }), "exactly one visible h1").toHaveCount(1);
      await expect(page.getByRole("main"), "one main landmark").toHaveCount(1);
      await expectNoHorizontalScroll(page);
      await expectNoFakeClaims(page);
      await expectNoSeriousAxe(page);
      expect(errors, "console / page errors").toEqual([]);
    });
  });
}
