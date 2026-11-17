/*
 * Phase 2 + 3 end-to-end workflow (source of truth: .claude-scratch-tasks/phase3.md, data: src/lib/demo/data.ts).
 * Every assertion message names the screen and its owner so a failure can be routed without reading the test.
 * Roles and visible text are used as selectors so the specs survive markup changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { DEMO_BOOKINGS, DEMO_PENDING_VERIFICATIONS, providerById, type DemoRole } from "../../src/lib/demo/data";
import {
  DEMO_HOME,
  completeBookingFlow,
  expectDemoBadge,
  expectNoFakeClaims,
  fillVisibleRequired,
  signInAsDemo,
  trackErrors,
} from "./helpers";

const DOCTOR = providerById("demo-dr-1")!;
const SERVICE = DOCTOR.services[0];
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const header = (page: Page) => page.getByRole("banner");

// ───────────────────────── 1. Landing and site navigation ─────────────────────────

test.describe("1. landing and navigation (owners t28 header/footer, t1y landing)", () => {
  test("anonymous header offers Find care, How it works, For providers, FAQ, Sign in, Create account", async ({ page }) => {
    await page.goto("/");
    const expected: [RegExp, RegExp][] = [
      [/^find care$/i, /\/categories$/],
      [/^how it works$/i, /\/how-it-works$/],
      [/^for providers$/i, /\/providers$/],
      [/^faq$/i, /\/faq$/],
      [/^sign in$/i, /\/sign-in$/],
      [/^create account$/i, /\/sign-up$/],
    ];
    for (const [name, href] of expected) {
      const link = header(page).getByRole("link", { name }).first();
      await expect(link, `header link ${name}`).toBeAttached();
      expect(await link.getAttribute("href"), `header link ${name} href`).toMatch(href);
    }
  });

  test("landing has Find care + Create account CTAs, provider role cards and a sign-in link", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /find care/i }).first()).toHaveAttribute("href", /\/categories$/);
    await expect(main.getByRole("link", { name: /create account/i }).first()).toHaveAttribute("href", /\/sign-up/);
    for (const role of ["doctor", "lab", "ambulance"]) {
      await expect(main.locator(`a[href="/sign-up?role=${role}"]`).first(), `role card → /sign-up?role=${role}`).toBeAttached();
    }
    await expect(page.locator('a[href^="/sign-in"]').first()).toBeAttached();
  });

  test("footer links every public page", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    for (const path of ["/how-it-works", "/categories", "/providers", "/faq", "/about", "/contact", "/privacy", "/terms", "/accessibility"]) {
      await expect(footer.locator(`a[href="${path}"]`).first(), `footer → ${path}`).toBeAttached();
    }
  });

  test("404 page links home and sign in", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("main").locator('a[href="/"]').first(), "404 → home").toBeAttached();
    await expect(page.getByRole("main").locator('a[href^="/sign-in"]').first(), "404 → sign in").toBeAttached();
  });
});

// ───────────────────────── 2. Sign-up per role ─────────────────────────

type SignUpCase = { role: Exclude<DemoRole, "admin">; option: RegExp; fields: RegExp[]; home: RegExp; extra?: RegExp };
const SIGN_UPS: SignUpCase[] = [
  {
    role: "patient",
    option: /^patient/i,
    fields: [/full name/i, /mobile/i, /email/i, /date of birth/i, /city/i, /language/i],
    home: /\/dashboard$/,
  },
  {
    role: "doctor",
    option: /^doctor/i,
    fields: [/full name/i, /speciality/i, /registration/i, /experience/i, /clinic|city/i, /fee/i],
    home: /\/provider\/onboarding$|\/provider$/,
  },
  {
    role: "lab",
    option: /^lab/i,
    fields: [/lab name/i, /licen[cs]e/i, /city/i, /hours/i, /contact person/i, /mobile/i],
    home: /\/provider\/onboarding$|\/provider$/,
  },
  {
    role: "ambulance",
    option: /ambulance/i,
    fields: [/operator name/i, /registration/i, /number of vehicles|vehicles/i, /base city|city/i, /vehicle type/i, /mobile/i],
    home: /\/provider\/onboarding$|\/provider$/,
    extra: /scheduled.{0,40}non-emergency|non-emergency.{0,40}scheduled/i,
  },
  {
    role: "caretaker",
    option: /^caretaker/i,
    fields: [/full name/i, /mobile/i, /city/i, /experience/i, /language/i],
    home: /\/caretaker$/,
  },
];

test.describe("2. sign-up per role (owner t27)", () => {
  test("offers five account types and no admin sign-up", async ({ page }) => {
    await page.goto("/sign-up");
    const main = page.getByRole("main");
    for (const c of SIGN_UPS) {
      await expect(main.getByRole("radio", { name: c.option }).or(main.getByRole("button", { name: c.option })).first(), `account type ${c.role}`).toBeVisible();
    }
    await expect(main.getByRole("radio", { name: /admin/i }).or(main.getByRole("button", { name: /admin/i }))).toHaveCount(0);
  });

  for (const c of SIGN_UPS) {
    test(`${c.role}: own details form, demo account created, lands on role home`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(c.role === "patient" || c.role === "caretaker" ? "/sign-up" : `/sign-up?role=${c.role}`);
      const main = page.getByRole("main");
      const choice = main.getByRole("radio", { name: c.option }).or(main.getByRole("button", { name: c.option })).first();
      if ((await choice.getAttribute("type")) === "radio" || (await choice.getAttribute("role")) === "radio") {
        await choice.check({ force: true });
      } else if (!(await choice.getAttribute("aria-pressed"))?.includes("true")) {
        await choice.click();
      }
      for (const field of c.fields) {
        await expect(main.getByLabel(field).first(), `${c.role} sign-up asks for ${field}`).toBeVisible();
      }
      if (c.extra) await expect(main, `${c.role} sign-up states scheduled non-emergency only`).toContainText(c.extra);
      if (c.role === "doctor") {
        // Fee is entered in rupees and must be validated (stored as paise server-side).
        await main.getByLabel(/fee/i).first().fill("abc");
      }
      await fillVisibleRequired(main);
      if (c.role === "doctor") {
        await main.getByRole("button", { name: /create account|sign up|continue/i }).last().click();
        await expect(main.getByRole("alert").first(), "doctor fee 'abc' is rejected").toBeVisible();
        await main.getByLabel(/fee/i).first().fill("500");
        await fillVisibleRequired(main);
      }
      await main.getByRole("button", { name: /create account|sign up/i }).last().click();
      await expect(page.getByText(/account created \(demo\)/i).first(), "\"Account created (demo)\" confirmation").toBeVisible();
      await expect(page, `${c.role} → role home`).toHaveURL(c.home, { timeout: 15_000 });
      await expectDemoBadge(page);
      expect(errors, "console / page errors").toEqual([]);
    });
  }
});

// ───────────────────────── 3. Sign-in, next= and route guards ─────────────────────────

const PROTECTED: { path: string; owner: DemoRole }[] = [
  { path: "/dashboard", owner: "patient" },
  { path: "/book", owner: "patient" },
  { path: "/account", owner: "patient" },
  { path: "/provider", owner: "doctor" },
  { path: "/provider/onboarding", owner: "doctor" },
  { path: "/caretaker", owner: "caretaker" },
  { path: "/admin", owner: "admin" },
];

test.describe("3. sign-in, next= and guards (owners t27 helper, t22 pages)", () => {
  for (const role of ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const) {
    test(`demo sign-in as ${role} lands on its home`, async ({ page }) => {
      await signInAsDemo(page, role);
      await expect(page).toHaveURL(DEMO_HOME[role]);
      await expectDemoBadge(page);
      await expectNoFakeClaims(page);
    });
  }

  test("next= is honoured for same-site paths", async ({ page }) => {
    await page.goto("/sign-in?next=%2Faccount");
    await page.getByRole("button", { name: /^Try demo as Patient\b/ }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  for (const evil of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "javascript:alert(1)"]) {
    test(`next=${evil} cannot redirect off-site (open redirect)`, async ({ page, baseURL }) => {
      await page.goto(`/sign-in?next=${encodeURIComponent(evil)}`);
      await page.getByRole("button", { name: /^Try demo as Patient\b/ }).click();
      await page.waitForLoadState("load");
      expect(new URL(page.url()).origin, "stays on our origin").toBe(new URL(baseURL!).origin);
    });
  }

  for (const { path } of PROTECTED) {
    test(`anonymous ${path} → /sign-in?next=${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    });
  }

  test("wrong role is sent to sign-in (patient → /admin)", async ({ page }) => {
    await signInAsDemo(page, "patient");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
  });

  test("signed-in header shows Dashboard + Sign out instead of Sign in / Create account", async ({ page }) => {
    await signInAsDemo(page, "patient");
    await page.goto("/");
    await expect(header(page).getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
    await expect(header(page).getByRole("link", { name: /sign out/i }).or(header(page).getByRole("button", { name: /sign out/i })).first()).toBeVisible();
    await expect(header(page).getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
    await expect(header(page).getByRole("link", { name: /^create account$/i })).toHaveCount(0);
  });

  test("sign-out clears the demo cookie", async ({ page, context }) => {
    await signInAsDemo(page, "patient");
    const cookie = (await context.cookies()).find((c) => c.name === "scv_demo_role");
    expect(cookie?.httpOnly, "demo cookie httpOnly").toBe(true);
    expect(cookie?.sameSite, "demo cookie SameSite").toBe("Lax");
    await page.goto("/sign-out");
    await page.getByRole("main").getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-out/);
    expect((await context.cookies()).find((c) => c.name === "scv_demo_role"), "cookie cleared").toBeUndefined();
  });
});

// ───────────────────────── 4. Role homes and role-aware app nav ─────────────────────────

const FOREIGN_HOMES: Record<DemoRole, string[]> = {
  patient: ["/provider", "/caretaker", "/admin"],
  doctor: ["/dashboard", "/caretaker", "/admin"],
  lab: ["/dashboard", "/caretaker", "/admin"],
  ambulance: ["/dashboard", "/caretaker", "/admin"],
  caretaker: ["/dashboard", "/provider", "/admin"],
  admin: ["/dashboard", "/provider", "/caretaker"],
};

test.describe("4. role homes (owner t22)", () => {
  for (const role of Object.keys(FOREIGN_HOMES) as DemoRole[]) {
    test(`${role}: app nav shows only its own area and has Sign out`, async ({ page }) => {
      await signInAsDemo(page, role);
      await expect(page).toHaveURL(DEMO_HOME[role]);
      const navs = page.getByRole("navigation");
      for (const foreign of FOREIGN_HOMES[role]) {
        await expect(navs.locator(`a[href="${foreign}"]`), `${role} nav must not link ${foreign}`).toHaveCount(0);
      }
      await expect(page.getByRole("link", { name: /sign out/i }).or(page.getByRole("button", { name: /sign out/i })).first()).toBeVisible();
    });
  }

  const KIND_WORDING: [DemoRole, RegExp][] = [
    ["doctor", /appointment/i],
    ["lab", /sample collection/i],
    ["ambulance", /scheduled transfer/i],
  ];
  for (const [role, wording] of KIND_WORDING) {
    test(`${role}: provider dashboard adapts its wording`, async ({ page }) => {
      await signInAsDemo(page, role);
      await expect(page.getByRole("main")).toContainText(wording);
      await expectNoFakeClaims(page);
    });
  }

  test("caretaker: linked patients and a read-only schedule", async ({ page }) => {
    await signInAsDemo(page, "caretaker");
    await expect(page).toHaveURL(/\/caretaker$/);
    await expectDemoBadge(page);
    await expect(page.getByRole("main")).toContainText(/linked patients?|patients you support/i);
    await expect(page.getByRole("main").getByRole("button", { name: /^(accept|decline|approve|reject)/i })).toHaveCount(0);
  });
});

// ───────────────────────── 5. Patient journey and provider decision ─────────────────────────

test.describe("5. patient journey → provider accepts → patient sees it (owners t1y, t22)", () => {
  test("landing → category → provider → book → confirm → dashboard → doctor accepts → patient sees accepted", async ({ page }) => {
    const errors = trackErrors(page);
    await signInAsDemo(page, "patient");

    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: /find care/i }).first().click();
    await expect(page, "landing → /categories").toHaveURL(/\/categories$/);
    await page.getByRole("main").getByRole("link", { name: /doctor/i }).first().click();
    await expect(page).toHaveURL(/\/categories\/doctor$/);
    await expectDemoBadge(page);

    await page.getByRole("link", { name: DOCTOR.name }).click();
    await expect(page).toHaveURL(new RegExp(`/providers/${DOCTOR.id}$`));
    await expect(h1(page)).toHaveText(DOCTOR.name);
    await expect(page.getByRole("main")).toContainText(/not collected/i);

    // The last listed slot (4 Dec 16:00 IST) has no existing demo booking, so the new row is unambiguous.
    await page.getByRole("radio", { name: new RegExp(SERVICE.name) }).check({ force: true });
    await page.getByRole("group", { name: /choose a time/i }).getByRole("radio").last().check({ force: true });
    const toBook = page.getByRole("link", { name: /continue to request/i });
    expect(await toBook.getAttribute("href")).toMatch(new RegExp(`^/book\\?provider=${DOCTOR.id}&service=${SERVICE.id}&slot=`));
    await toBook.click();
    await expect(page).toHaveURL(/\/book\?/);
    await expect(page.getByRole("main"), "/book prefilled with provider").toContainText(DOCTOR.name);

    await completeBookingFlow(page);
    await expect(page.getByRole("main")).toContainText(/requested/i);
    await expect(page.getByRole("main")).toContainText(/not collected/i);
    await expectDemoBadge(page);
    await expectNoFakeClaims(page);

    await page.goto("/dashboard");
    const newRow = page.getByRole("main").locator("li, tr, article").filter({ hasText: DOCTOR.name }).filter({ hasText: /\b4\b.{0,6}Dec|Dec.{0,6}\b4\b/i }).first();
    await expect(newRow, "dashboard lists the new request").toBeVisible();
    await expect(newRow).toContainText(/requested/i);

    // Same tab, so the per-tab demo store is shared across the role switch.
    await signInAsDemo(page, "doctor");
    const inboxRow = page.getByRole("main").locator("li, tr, article").filter({ hasText: "Demo Patient One" }).filter({ hasText: /\b4\b.{0,6}Dec|Dec.{0,6}\b4\b/i }).first();
    await expect(inboxRow, "provider inbox shows the new request").toBeVisible();
    await inboxRow.getByRole("button", { name: /^accept/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /accepted/i }).first(), "accept is announced").toBeAttached();

    await signInAsDemo(page, "patient");
    await page.goto("/dashboard");
    const after = page.getByRole("main").locator("li, tr, article").filter({ hasText: DOCTOR.name }).filter({ hasText: /\b4\b.{0,6}Dec|Dec.{0,6}\b4\b/i }).first();
    await expect(after, "patient sees the provider's decision").toContainText(/accepted/i);
    expect(errors, "console / page errors").toEqual([]);
  });

  test("doctor declines the seeded request; it moves to Declined", async ({ page }) => {
    const seeded = DEMO_BOOKINGS.find((b) => b.providerId === DOCTOR.id && b.status === "requested")!;
    await signInAsDemo(page, "doctor");
    await page.getByRole("button", { name: `Decline request from ${seeded.patientName}` }).first().click();
    await expect(page.getByRole("region", { name: /declined/i }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: /declined/i }) })).first()).toContainText(seeded.patientName);
  });

  test("ambulance profile is scheduled-only with no ETA", async ({ page }) => {
    await page.goto("/providers/demo-amb-1");
    await expect(page.getByRole("main")).toContainText(/non-emergency|scheduled/i);
    await expect(page.getByRole("main")).toContainText("112");
    await expectNoFakeClaims(page);
  });
});

// ───────────────────────── 6. Admin ─────────────────────────

test.describe("6. admin (owner t22)", () => {
  test("approves a demo applicant in the verification queue", async ({ page }) => {
    await signInAsDemo(page, "admin");
    const applicant = DEMO_PENDING_VERIFICATIONS[0];
    await page.getByRole("button", { name: `Approve ${applicant.name}` }).click();
    await expect(page.getByRole("main")).toContainText("Approved (demo)");
    await expectDemoBadge(page);
    await expectNoFakeClaims(page);
  });
});
