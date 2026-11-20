import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => null,
}));

import {
  APP_ROUTES,
  ROUTE_ROLES,
  canAccess,
  destinationFor,
  homeFor,
  knownRoles,
  mayOpen,
  safeNext,
  signInUrl,
} from "@/components/app/access";
import { AppNav } from "@/components/app/app-nav";
import { PATIENT_NAV, currentHref, navFor, providerNav } from "@/components/app/nav-model";
import { accountSchema, bookingAreaSchema, bookingChoiceSchema, bookingDetailsSchema, toE164 } from "@/components/app/schemas";
import {
  AccountScreen,
  AdminScreen,
  BookScreen,
  DashboardScreen,
  OnboardingScreen,
  ProviderScreen,
} from "@/components/app/screens";
import { Stepper } from "@/components/app/stepper";
import { canOpenStep, stepErrors } from "@/components/app/steps";
import { StatusPill } from "@/components/app/visit-parts";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("route access", () => {
  it("lets patients book, providers open the provider area, admins the queue, and everyone their account", () => {
    expect(ROUTE_ROLES["/dashboard"]).toEqual(["patient"]);
    expect(ROUTE_ROLES["/book"]).toEqual(["patient"]);
    expect(ROUTE_ROLES["/provider"]).toEqual(["doctor", "lab", "ambulance", "caretaker"]);
    expect(ROUTE_ROLES["/admin"]).toEqual(["admin"]);
    expect(ROUTE_ROLES["/account"]).toHaveLength(6);
    expect(mayOpen(["patient"], "/admin")).toBe(false);
    expect(mayOpen(["patient", "lab"], "/provider")).toBe(true);
  });
  it("sends each account to its most specific area", () => {
    expect(homeFor(["patient"])).toBe("/dashboard");
    expect(homeFor(["patient", "doctor"])).toBe("/provider");
    expect(homeFor(["patient", "admin", "lab"])).toBe("/admin");
    expect(homeFor([])).toBe("/account");
  });
  it("gives every role a home it may open", () => {
    for (const role of ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const) {
      const home = homeFor([role]);
      expect(APP_ROUTES).toContain(home);
      expect(mayOpen([role], home)).toBe(true);
    }
  });
  it("ignores role strings this UI does not know", () => {
    expect(knownRoles(["patient", "superuser", "admin", 7])).toEqual(["patient", "admin"]);
  });
  it("keeps only safe same-site next paths, with their query", () => {
    expect(safeNext("/book?category=doctor&pin=500001")).toBe("/book?category=doctor&pin=500001");
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil", "/sign-in?next=/x", "book", "", "/a\u0000"]) {
      expect(safeNext(bad), bad).toBeNull();
    }
  });
  it("continues to next only when the account may open it", () => {
    expect(destinationFor(["patient"], "/book?pin=500001")).toBe("/book?pin=500001");
    expect(destinationFor(["patient"], "/admin")).toBe("/dashboard");
    expect(destinationFor(["patient", "doctor"], null)).toBe("/provider");
    expect(canAccess(["patient"], "/categories/doctor")).toBe(true);
    expect(signInUrl("/book?pin=500001")).toBe("/sign-in?next=%2Fbook%3Fpin%3D500001");
  });
});

describe("role-aware nav", () => {
  it("shows the provider area, account and sign out for a provider", () => {
    pathname = "/provider";
    const out = html(createElement(AppNav, { roles: ["patient", "lab"], name: "Asha" }));
    expect(out).toMatch(/<nav[^>]*aria-label="Lab area"/);
    expect(out).toContain("Sample collections");
    expect(out).toContain('href="/sign-out"');
    expect(out).not.toContain('href="/admin"');
    expect(/<a[^>]*href="\/provider"[^>]*>/.exec(out)?.[0]).toContain('aria-current="page"');
  });
  it("never lists admin links for other roles", () => {
    for (const role of ["patient", "doctor", "lab", "ambulance", "caretaker"] as const) {
      expect(navFor(["patient", role]).some((i) => i.href.startsWith("/admin"))).toBe(false);
    }
  });
  it("marks only the most specific link as current", () => {
    expect(currentHref("/provider/onboarding", providerNav("doctor"))).toBe("/provider/onboarding");
    expect(currentHref("/provider", providerNav("doctor"))).toBe("/provider");
    expect(currentHref("/book", PATIENT_NAV)).toBe("/book");
  });
  it("offers only sign-in without a session", () => {
    const out = html(createElement(AppNav, { roles: null }));
    expect(out).toContain('href="/sign-in"');
    expect(out).not.toContain('href="/account"');
  });
});

describe("step helpers", () => {
  it("only opens steps already reached", () => {
    expect(canOpenStep(0, 0, 5)).toBe(true);
    expect(canOpenStep(2, 1, 5)).toBe(false);
    expect(canOpenStep(1, 3, 5)).toBe(true);
    expect(canOpenStep(5, 5, 5)).toBe(false);
    expect(canOpenStep(-1, 3, 5)).toBe(false);
  });
  it("returns field errors from a schema", () => {
    expect(stepErrors(bookingAreaSchema, { pin: "012345" })).toHaveProperty("pin");
    expect(stepErrors(bookingAreaSchema, { pin: " 500001 " })).toEqual({});
  });
});

describe("booking form rules", () => {
  it("needs a provider, a date and a time before details", () => {
    expect(Object.keys(stepErrors(bookingChoiceSchema, {})).sort()).toEqual(["choice", "date", "slot"]);
    expect(stepErrors(bookingChoiceSchema, { choice: "x", date: "2026-12-02", slot: "s" })).toEqual({});
  });
  it("needs the address, a contact, an Indian mobile and consent", () => {
    const errors = stepErrors(bookingDetailsSchema, { line1: "", locality: "", contactName: "", phone: "5876543210", consent: false });
    expect(Object.keys(errors).sort()).toEqual(["consent", "contactName", "line1", "locality", "phone"]);
    expect(
      stepErrors(bookingDetailsSchema, { line1: "1 Road", locality: "Area", contactName: "Asha", phone: "98765 43210", consent: true }),
    ).toEqual({});
  });
  it("sends phone numbers in the +91 form the address API requires", () => {
    expect(toE164("098765-43210")).toBe("+919876543210");
    expect(toE164("98765")).toBeNull();
  });
  it("validates account name and language", () => {
    expect(accountSchema.safeParse({ name: "A B", language: "te" }).success).toBe(true);
    expect(accountSchema.safeParse({ name: "A B", language: "fr" }).success).toBe(false);
    expect(accountSchema.safeParse({ name: " ", language: "en" }).success).toBe(false);
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

describe("screens", () => {
  const forbidden = /\bverified\b|\bpaid\b|\bratings?\b|\bstars?\b|\breviews\b|\bETA\b|\bguarantee|\bdemo\b/i;
  const all = {
    dashboard: () => html(createElement(DashboardScreen, { recordsOpen: false })),
    book: () => html(createElement(BookScreen)),
    provider: () => html(createElement(ProviderScreen)),
    onboarding: () => html(createElement(OnboardingScreen)),
    admin: () => html(createElement(AdminScreen)),
    account: () => html(createElement(AccountScreen)),
  };
  for (const [name, render] of Object.entries(all)) {
    it(`${name} renders its h1 at once and checks the session before showing anything personal`, () => {
      const out = render();
      expect(out.match(/<h1/g)).toHaveLength(1);
      expect(out).toContain("Checking your session");
      expect(out).toMatch(/role="status"/);
    });
    it(`${name} makes no unbacked or demo claims`, () => {
      expect(render()).not.toMatch(forbidden);
    });
  }
});

describe("status pill", () => {
  it("labels booking states without implying payment", () => {
    expect(html(createElement(StatusPill, { state: "requested" }))).toContain("Waiting for provider");
    expect(html(createElement(StatusPill, { state: "confirmed" }))).toContain("Confirmed by provider");
  });
});
