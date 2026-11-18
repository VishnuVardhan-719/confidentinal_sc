import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
let pathname = "/dashboard";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
  usePathname: () => pathname,
  useSearchParams: () => null,
}));

import { ROLE_HOME, ROUTE_ROLES, APP_ROUTES, bookNextPath, gate, signInUrl } from "@/components/app/access";
import { AppNav } from "@/components/app/app-nav";
import {
  DEMO_PROVIDER_ID,
  EMPTY_DEMO_STATE,
  allBookings,
  formatSlot,
  prefillFromParams,
  providerForUser,
  reduceDemo,
  splitVisits,
  takenSlots,
} from "@/components/app/demo-model";
import { NAV_BY_ROLE, currentHref } from "@/components/app/nav-model";
import { requireDemoRole } from "@/components/app/require-role";
import {
  AccountScreen,
  AdminScreen,
  BookScreen,
  CaretakerScreen,
  DashboardScreen,
  OnboardingScreen,
  ProviderScreen,
} from "@/components/app/screens";
import {
  accountSchema,
  bookingAreaSchema,
  bookingChoiceSchema,
  normaliseIndianMobile,
  onboardingAreaSchema,
  onboardingDetailsSchema,
  parsePinList,
} from "@/components/app/schemas";
import { Stepper } from "@/components/app/stepper";
import { canOpenStep, stepErrors } from "@/components/app/steps";
import { DEMO_COOKIE, DEMO_HOME } from "@/lib/demo/auth-core";
import { DEMO_LABEL, DEMO_USERS, type DemoBooking, type DemoRole } from "@/lib/demo/data";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const params = (q: Record<string, string>) => new URLSearchParams(q);
const user = (role: DemoRole) => DEMO_USERS.find((u) => u.role === role)!;
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { to?: string }).to ?? String(e);
  }
};

beforeEach(() => jar.clear());
afterEach(() => vi.unstubAllEnvs());

describe("route access (demo roles)", () => {
  it("lets each role open only its own area, and everyone open /account", () => {
    expect(ROUTE_ROLES["/dashboard"]).toEqual(["patient"]);
    expect(ROUTE_ROLES["/book"]).toEqual(["patient"]);
    expect(ROUTE_ROLES["/provider"]).toEqual(["doctor", "lab", "ambulance"]);
    expect(ROUTE_ROLES["/caretaker"]).toEqual(["caretaker"]);
    expect(ROUTE_ROLES["/admin"]).toEqual(["admin"]);
    expect(ROUTE_ROLES["/account"]).toHaveLength(6);
  });
  it("sends a missing session to sign-in with next", () => {
    expect(gate(null, "/admin")).toEqual({ ok: false, redirectTo: "/sign-in?next=%2Fadmin" });
    expect(signInUrl("/book?provider=demo-dr-1")).toBe("/sign-in?next=%2Fbook%3Fprovider%3Ddemo-dr-1");
  });
  it("sends a signed-in user with the wrong role to their own home", () => {
    expect(gate({ role: "patient" }, "/admin")).toEqual({ ok: false, redirectTo: "/dashboard" });
    expect(gate({ role: "caretaker" }, "/provider")).toEqual({ ok: false, redirectTo: "/caretaker" });
    expect(gate({ role: "lab" }, "/provider")).toEqual({ ok: true });
  });
  it("gives every role a home it is allowed to open", () => {
    for (const [role, home] of Object.entries(ROLE_HOME)) {
      expect(ROUTE_ROLES[home].includes(role as DemoRole)).toBe(true);
    }
  });
  it("agrees with demo sign-in about where each role lands (except caretaker, see report)", () => {
    for (const role of ["patient", "doctor", "lab", "ambulance", "admin"] as const) {
      expect(DEMO_HOME[role]).toBe(ROLE_HOME[role]);
    }
  });
  it("keeps only booking prefill keys in the /book next path", () => {
    expect(bookNextPath({ provider: "demo-dr-1", slot: "x", evil: "1" })).toBe("/book?provider=demo-dr-1&slot=x");
    expect(bookNextPath({ provider: "a".repeat(65) })).toBe("/book");
    expect(bookNextPath({})).toBe("/book");
  });
  it("requireDemoRole redirects, or returns the session", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await redirectOf(requireDemoRole("/provider"))).toBe("/sign-in?next=%2Fprovider");
    jar.set(DEMO_COOKIE, "patient");
    expect(await redirectOf(requireDemoRole("/provider"))).toBe("/dashboard");
    jar.set(DEMO_COOKIE, "doctor");
    expect((await requireDemoRole("/provider")).name).toBe(user("doctor").name);
  });
  it("treats every app route as signed out when demo mode is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    jar.set(DEMO_COOKIE, "admin");
    for (const route of APP_ROUTES) {
      expect(await redirectOf(requireDemoRole(route))).toBe(signInUrl(route));
    }
  });
});

describe("role-aware nav", () => {
  it("shows only the signed-in role's links plus account and sign out", () => {
    pathname = "/provider";
    const out = html(createElement(AppNav, { role: "lab", name: user("lab").name }));
    expect(out).toMatch(/<nav[^>]*aria-label="Lab area"/);
    expect(out).toContain("Sample collections");
    expect(out).toContain('href="/sign-out"');
    expect(out).not.toContain('href="/admin"');
    expect(out).not.toContain('href="/dashboard"');
    expect(out).toMatch(/aria-current="page"[^>]*>|href="\/provider"[^>]*aria-current="page"/);
  });
  it("never lists admin links for other roles", () => {
    for (const role of ["patient", "doctor", "lab", "ambulance", "caretaker"] as const) {
      expect(NAV_BY_ROLE[role].some((i) => i.href.startsWith("/admin"))).toBe(false);
    }
  });
  it("marks only the most specific link as current", () => {
    expect(currentHref("/provider/onboarding", NAV_BY_ROLE.doctor)).toBe("/provider/onboarding");
    expect(currentHref("/provider", NAV_BY_ROLE.doctor)).toBe("/provider");
    expect(currentHref("/book", NAV_BY_ROLE.doctor)).toBeUndefined();
  });
  it("offers only sign-in without a session", () => {
    const out = html(createElement(AppNav, { role: null }));
    expect(out).toContain('href="/sign-in"');
    expect(out).not.toContain('href="/account"');
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
  it("requires a provider, service and time before review", () => {
    expect(Object.keys(stepErrors(bookingChoiceSchema, {})).sort()).toEqual(["providerId", "serviceId", "slot"]);
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
  it("validates account details and language", () => {
    expect(accountSchema.safeParse({ name: "A B", phone: "9876543210", email: "a@b.in", language: "te" }).success).toBe(true);
    expect(accountSchema.safeParse({ name: "A B", phone: "9876543210", email: "a@b.in", language: "fr" }).success).toBe(false);
  });
});

describe("demo state", () => {
  const request: DemoBooking = {
    id: "t-1",
    providerId: DEMO_PROVIDER_ID,
    serviceId: "s1",
    patientName: "Demo Patient One",
    startsAt: "2026-12-06T04:30:00.000Z",
    status: "requested",
    paymentStatus: "not_collected",
  };
  const withRequest = reduceDemo(EMPTY_DEMO_STATE, { type: "createBooking", booking: request });

  it("adds a sent request with payment not collected", () => {
    const found = allBookings(withRequest).find((b) => b.id === "t-1");
    expect(found?.status).toBe("requested");
    expect(found?.paymentStatus).toBe("not_collected");
  });
  it("lets a provider answer a request only once", () => {
    const accepted = reduceDemo(withRequest, { type: "setStatus", id: "t-1", status: "accepted" });
    expect(allBookings(accepted).find((b) => b.id === "t-1")?.status).toBe("accepted");
    const again = reduceDemo(accepted, { type: "setStatus", id: "t-1", status: "declined" });
    expect(again).toBe(accepted);
  });
  it("ignores statuses a provider cannot set", () => {
    expect(reduceDemo(withRequest, { type: "setStatus", id: "t-1", status: "completed" })).toBe(withRequest);
    expect(reduceDemo(withRequest, { type: "setStatus", id: "nope", status: "accepted" })).toBe(withRequest);
  });
  it("records and undoes admin decisions", () => {
    const approved = reduceDemo(EMPTY_DEMO_STATE, { type: "decide", id: "demo-v-1", decision: "approved" });
    expect(approved.decisions["demo-v-1"]).toBe("approved");
    expect(reduceDemo(approved, { type: "decide", id: "demo-v-1", decision: null }).decisions).toEqual({});
  });
  it("splits visits by status and marks held slots as taken", () => {
    const { upcoming, past } = splitVisits(allBookings(withRequest));
    expect(upcoming.every((b) => b.status === "requested" || b.status === "accepted")).toBe(true);
    expect(past.some((b) => b.status === "completed")).toBe(true);
    expect(takenSlots(allBookings(withRequest), DEMO_PROVIDER_ID).has(request.startsAt)).toBe(true);
  });
  it("keeps only real provider, service and slot values from a link", () => {
    expect(prefillFromParams(params({ provider: "demo-dr-1", service: "s2", slot: "2026-12-02T05:00:00.000Z" }))).toEqual({
      service: "doctor",
      providerId: "demo-dr-1",
      serviceId: "s2",
      slot: "2026-12-02T05:00:00.000Z",
    });
    expect(prefillFromParams(params({ provider: "demo-amb-1", service: "zzz", slot: "x" }))).toEqual({
      service: "scheduled-ambulance",
      providerId: "demo-amb-1",
      serviceId: undefined,
      slot: undefined,
    });
    expect(prefillFromParams(params({ provider: "<script>" }))).toEqual({});
    expect(prefillFromParams(null)).toEqual({});
  });
  it("formats slots in India time", () => {
    expect(formatSlot("2026-12-02T04:30:00.000Z")).toBe("Wed, 2 Dec, 10:00 am IST");
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
  const forbidden = /\bverified\b|\bpaid\b|\bratings?\b|\bstars?\b|\breviews\b|\bETA\b|\bguarantee/i;
  const patient = user("patient");
  const all = {
    dashboard: () => html(createElement(DashboardScreen, { name: patient.name, recordsOpen: false })),
    book: () => html(createElement(BookScreen, { patientName: patient.name })),
    provider: () => html(createElement(ProviderScreen, { provider: providerForUser(user("doctor").name) })),
    onboarding: () => html(createElement(OnboardingScreen, { role: "doctor" })),
    caretaker: () => html(createElement(CaretakerScreen, { name: user("caretaker").name })),
    admin: () => html(createElement(AdminScreen)),
    account: () => html(createElement(AccountScreen, { role: "patient", name: patient.name, email: patient.email })),
  };
  for (const [name, render] of Object.entries(all)) {
    it(`${name} makes no unbacked claims`, () => {
      expect(render()).not.toMatch(forbidden);
    });
  }
  for (const name of ["dashboard", "provider", "caretaker", "admin", "account"] as const) {
    it(`${name} shows the demo badge`, () => {
      expect(all[name]()).toContain(DEMO_LABEL);
    });
  }
  it("dashboard lists the signed-in patient's visits and locks records", () => {
    const out = all.dashboard();
    expect(out).toContain(`Signed in to the demo as ${patient.name}`);
    expect(out).toContain("Basic health panel"); // demo-b-2, accepted
    expect(out).toContain("Payment not collected");
    expect(out).toContain("Records are not available yet");
    expect(html(createElement(DashboardScreen, { name: patient.name, recordsOpen: true }))).toContain("No records yet");
  });
  it("provider screen adapts to the provider kind", () => {
    expect(all.provider()).toContain("Appointments");
    expect(all.provider()).toContain("Accept request from Demo Patient One");
    const lab = html(createElement(ProviderScreen, { provider: providerForUser(user("lab").name) }));
    expect(lab).toContain("Sample collections");
    expect(lab).toContain("Accept request from Demo Patient Three");
    const amb = html(createElement(ProviderScreen, { provider: providerForUser(user("ambulance").name) }));
    expect(amb).toContain("Scheduled transfers");
    expect(amb).toContain("non-emergency");
    expect(html(createElement(ProviderScreen, { provider: undefined }))).toContain("No provider profile");
  });
  it("onboarding starts with the signed-in provider kind chosen", () => {
    expect(all.onboarding()).toMatch(/<input[^>]*checked=""[^>]*value="doctor"|<input[^>]*value="doctor"[^>]*checked=""/);
  });
  it("caretaker sees the people they support, read-only", () => {
    const out = all.caretaker();
    expect(out).toContain("Demo Patient One");
    expect(out).toContain("Read-only");
    expect(out).not.toMatch(/>Accept<|>Decline<|>Cancel</);
  });
  it("admin queue lists demo applications with approve and reject", () => {
    const out = all.admin();
    expect(out).toContain("Approve Demo Clinic Applicant (Demo)");
    expect(out).toContain("Reject Demo Lab Applicant (Demo)");
  });
  it("account form uses the signed-in user and offers three languages", () => {
    const out = all.account();
    expect(out).toContain(`value="${patient.email}"`);
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*>Save changes/);
    expect(out).toContain('lang="te"');
    expect(out).toContain('lang="hi"');
  });
});