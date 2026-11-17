import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPage from "@/app/(app)/account/page";
import AdminVerificationPage from "@/app/(app)/admin/page";
import BookPage from "@/app/(app)/book/page";
import PatientDashboardPage from "@/app/(app)/dashboard/page";
import ProviderOnboardingPage from "@/app/(app)/provider/onboarding/page";
import ProviderRequestsPage from "@/app/(app)/provider/page";
import { AppShell } from "@/components/app/app-shell";
import { formatVisitDate } from "@/components/app/booking-flow";
import { NAV_BY_ROLE, currentHref, roleForPath } from "@/components/app/nav-model";
import {
  bookingAreaSchema,
  bookingWhenSchema,
  normaliseIndianMobile,
  onboardingAreaSchema,
  onboardingDetailsSchema,
  parsePinList,
  todayInIndia,
} from "@/components/app/schemas";
import { Stepper } from "@/components/app/stepper";
import { canOpenStep, stepErrors } from "@/components/app/steps";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const page = (Page: () => Parameters<typeof renderToStaticMarkup>[0]) => html(createElement(Page));

afterEach(() => vi.unstubAllEnvs());

describe("role-aware nav model", () => {
  it("infers the area from the path", () => {
    expect(roleForPath("/provider")).toBe("provider");
    expect(roleForPath("/provider/onboarding")).toBe("provider");
    expect(roleForPath("/admin")).toBe("admin");
    expect(roleForPath("/dashboard")).toBe("patient");
    expect(roleForPath("/providers-list")).toBe("patient");
  });
  it("marks only the most specific link as current", () => {
    expect(currentHref("/provider/onboarding", NAV_BY_ROLE.provider)).toBe("/provider/onboarding");
    expect(currentHref("/provider", NAV_BY_ROLE.provider)).toBe("/provider");
    expect(currentHref("/book", NAV_BY_ROLE.provider)).toBeUndefined();
  });
  it("never shows admin links outside the admin area", () => {
    for (const role of ["patient", "provider"] as const) {
      expect(NAV_BY_ROLE[role].some((i) => i.href.startsWith("/admin"))).toBe(false);
    }
  });
});

describe("step helpers", () => {
  it("only opens steps already reached", () => {
    expect(canOpenStep(0, 0, 4)).toBe(true);
    expect(canOpenStep(2, 1, 4)).toBe(false);
    expect(canOpenStep(1, 3, 4)).toBe(true);
    expect(canOpenStep(4, 4, 4)).toBe(false);
    expect(canOpenStep(-1, 3, 4)).toBe(false);
  });
  it("returns field errors from a schema", () => {
    expect(stepErrors(bookingAreaSchema, { pin: "012345" })).toHaveProperty("pin");
    expect(stepErrors(bookingAreaSchema, { pin: " 500001 " })).toEqual({});
  });
});

describe("form rules", () => {
  it("computes today in IST, not UTC", () => {
    expect(todayInIndia(new Date("2026-11-17T19:00:00Z"))).toBe("2026-11-18");
    expect(todayInIndia(new Date("2026-11-17T18:00:00Z"))).toBe("2026-11-17");
  });
  it("rejects past dates and requires a time of day", () => {
    const schema = bookingWhenSchema("2026-11-18");
    expect(schema.safeParse({ date: "2026-11-17", window: "morning" }).success).toBe(false);
    expect(schema.safeParse({ date: "2026-11-18", window: "" }).success).toBe(false);
    expect(schema.safeParse({ date: "2026-11-18", window: "evening" }).success).toBe(true);
  });
  it("accepts common Indian mobile formats only", () => {
    expect(normaliseIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normaliseIndianMobile("098765-43210")).toBe("9876543210");
    expect(normaliseIndianMobile("5876543210")).toBeNull();
    expect(normaliseIndianMobile("98765")).toBeNull();
  });
  it("parses and checks provider PIN lists", () => {
    expect(parsePinList("500001, 500002\n500001")).toEqual(["500001", "500002"]);
    expect(onboardingAreaSchema.safeParse({ pins: "500001 500002" }).success).toBe(true);
    expect(onboardingAreaSchema.safeParse({ pins: "50001" }).success).toBe(false);
    expect(onboardingAreaSchema.safeParse({ pins: "  " }).success).toBe(false);
  });
  it("requires provider details", () => {
    const errors = stepErrors(onboardingDetailsSchema, { name: "", registration: "", phone: "1", email: "x" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "phone", "registration"]);
  });
  it("formats visit dates without shifting the day", () => {
    expect(formatVisitDate("2026-11-18")).toMatch(/^Wed, 18 Nov,? 2026$/);
  });
});

describe("Stepper", () => {
  const steps = [
    { id: "a", title: "First" },
    { id: "b", title: "Second" },
    { id: "c", title: "Third" },
  ];
  const out = html(createElement(Stepper, { steps, current: 1, furthest: 1, onOpen: () => {}, label: "Steps" }));
  it("marks the current step and lets earlier steps be reopened", () => {
    expect(out).toContain('aria-current="step"');
    expect(out.match(/<button/g)).toHaveLength(2);
    expect(out).toContain("Step 1 of 3: First, completed");
    expect(out).toContain("Step 2 of 3: Second, current");
    expect(out).toContain("Step 3 of 3: Third, not started");
  });
});

describe("app shell", () => {
  const out = html(createElement(AppShell, null, createElement("p", null, "content")));
  it("has a skip link to the page content and one labelled nav", () => {
    expect(out).toContain('href="#app-content"');
    expect(out).toContain('id="app-content"');
    expect(out.match(/<nav /g)).toHaveLength(1);
    expect(out).toMatch(/<nav[^>]*aria-label="Patient area"/);
  });
  it("says plainly that nothing is saved", () => {
    expect(out).toContain("Nothing you enter is saved or sent.");
  });
});

describe("app pages make no unbacked claims", () => {
  // Prices, ratings, stars, reviews of providers, "verified" or "paid" states must not appear before real data exists.
  const forbidden = /₹|\bRs\.?\s?\d|\bverified\b|\bpaid\b|\brating|\bstars?\b|\bavailable now\b|\bETA\b/i;
  const pages = {
    dashboard: PatientDashboardPage,
    book: BookPage,
    provider: ProviderRequestsPage,
    onboarding: ProviderOnboardingPage,
    admin: AdminVerificationPage,
    account: AccountPage,
  };
  for (const [name, Page] of Object.entries(pages)) {
    it(`${name} renders without claims`, () => {
      expect(page(Page)).not.toMatch(forbidden);
    });
  }
});

describe("dashboard", () => {
  it("locks records while the clinical flag is off", () => {
    vi.stubEnv("FEATURE_CLINICAL", "");
    const out = page(PatientDashboardPage);
    expect(out).toContain("Records are not available yet");
    expect(out).toContain('href="/categories"');
  });
  it("shows an empty records state when the clinical flag is on", () => {
    vi.stubEnv("FEATURE_CLINICAL", "true");
    expect(page(PatientDashboardPage)).toContain("No records yet");
  });
});

describe("unconnected actions", () => {
  it("keeps accept and decline disabled with an explanation", () => {
    const out = page(ProviderRequestsPage);
    expect(out.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(out.match(/aria-describedby="respond-not-connected"/g)).toHaveLength(2);
    expect(out).toContain('id="respond-not-connected"');
  });
  it("keeps account saving disabled with an explanation", () => {
    const out = page(AccountPage);
    expect(out).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-describedby="account-not-connected"/);
    expect(out).toContain('lang="te"');
  });
  it("starts the booking flow at step 1 with no providers listed", () => {
    const out = page(BookPage);
    expect(out).toContain("Step 1 of 4: Service, current");
    expect(out).toContain('name="service"');
    expect(out).not.toMatch(/Dr\.|provider name/i);
  });
  it("shows an empty verification queue", () => {
    expect(page(AdminVerificationPage)).toContain("No profiles to review");
  });
});
