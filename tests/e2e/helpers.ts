import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route } from "@playwright/test";

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

/**
 * Owner rule: never imply real ratings, reviews, ETAs, verification or payment.
 * Negations such as "Payment not collected online" are fine, so this looks for claims, not words.
 */
export async function expectNoFakeClaims(page: Page) {
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const claims: [string, RegExp][] = [
    ["star rating", /[★☆]|\b\d(\.\d)?\s*(\/\s*5|stars?|out of 5)\b/i],
    ["ratings or reviews", /\b\d[\d,]*\s+(ratings?|reviews?)\b|\b(patient|customer|user|verified)\s+(reviews?|ratings?)\b|\brated\s+\d|\btestimonials?\b/i],
    ["ETA / arrival time", /\bETA\b|\barriv(es|ing|al)\s+(in|within)\s+\d/i],
    ["verified badge", /\b(verified|certified|trusted)\s+(doctor|provider|lab|ambulance|caretaker|profile|partner)s?\b/i],
    ["payment taken", /\b(payment\s+(successful|received|complete[d]?|confirmed)|paid\s+(in full|successfully|₹))\b/i],
    ["emergency service", /\b(emergency\s+(ambulance|dispatch|response)\s+(available|in\s+\d))\b/i],
  ];
  const found = claims.filter(([, re]) => re.test(text)).map(([name, re]) => `${name}: "${text.match(re)?.[0]}"`);
  expect(found, "fake trust/payment/ETA claims on the page").toEqual([]);
}

/*
 * Synthetic stand-in for the app's own /api routes, so browser tests need no database. Every value is made up
 * (example.invalid, SCV-*-9000xx references) and the shapes follow the route handlers in src/app/api.
 */

export const SERVICE_ID = "5e000000-0000-4000-8000-000000000001";
export const PROVIDER_REF = "SCV-DOC-900001";
const PATIENT_ID = "9a000000-0000-4000-8000-000000000001";
const ADDRESS_ID = "ad000000-0000-4000-8000-000000000001";
const BOOKING_ID = "b0000000-0000-4000-8000-000000000001";

export type MockOptions = { roles?: string[]; catalogFailures?: number };

export type MockBackend = {
  /** Every request to /api, in order, as "METHOD /path?query". */
  log: string[];
  bookingRequests: { headers: Record<string, string>; body: Record<string, unknown> }[];
  cancelRequests: Record<string, unknown>[];
};

function catalogRow(n: number) {
  return {
    provider_reference: n === 1 ? PROVIDER_REF : `SCV-DOC-90000${n}`,
    category: "doctor",
    display_name: `Synthetic Clinic ${n}`,
    public_profile: { category: "doctor", display_name: `Synthetic Clinic ${n}`, specialty: "General medicine", languages: ["English", "Telugu"] },
    service_id: n === 1 ? SERVICE_ID : `5e000000-0000-4000-8000-00000000000${n}`,
    service_title: "Home visit",
    duration_minutes: 30,
    amount_paise: n === 1 ? "150000" : "90000",
    currency: "INR",
    unit: "visit",
    terms_version: "synthetic-terms-1",
    pin_code: "500001",
    city: "Hyderabad",
    advisory_availability: null,
  };
}

function istDay(offset: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

/** A date a few days ahead in India time, as YYYY-MM-DD. */
export const BOOK_DATE = istDay(3);

export async function mockBackend(page: Page, options: MockOptions = {}): Promise<MockBackend> {
  const roles = options.roles ?? ["patient"];
  let catalogFailures = options.catalogFailures ?? 0;
  const state: MockBackend = { log: [], bookingRequests: [], cancelRequests: [] };
  let booking: Record<string, unknown> | null = null;

  const reply = (route: Route, status: number, body?: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body) });
  const authed = (route: Route) => /^Bearer synthetic-access-/.test(route.request().headers().authorization ?? "");

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    state.log.push(`${method} ${path}${url.search}`);
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : {};

    if (method === "POST" && path === "/api/auth/login") {
      return body.password === "synthetic-password-1"
        ? reply(route, 200, { accessToken: "synthetic-access-1", refreshToken: "synthetic-refresh-1", expiresAt: 4_102_444_800 })
        : reply(route, 401, { error: { code: "invalid_credentials" } });
    }
    if (method === "POST" && path === "/api/auth/logout") return reply(route, 200, { status: "signed_out" });
    if (method === "GET" && path === "/api/catalog") {
      if (catalogFailures > 0) {
        catalogFailures -= 1;
        return reply(route, 503, { error: { code: "catalog_unavailable" } });
      }
      return reply(route, 200, { results: [catalogRow(1), catalogRow(2)], nextCursor: null });
    }
    if (method === "GET" && path.startsWith("/api/catalog/")) return reply(route, 200, { results: [catalogRow(1)] });

    if (!authed(route)) return reply(route, 401, { error: { code: "unauthenticated" } });

    if (method === "GET" && path === "/api/auth/me") {
      return reply(route, 200, { profile: { id: "pr000000-0000-4000-8000-000000000001", display_name: "Synthetic Patient", locale: "en", version: 1 }, roles });
    }
    if (method === "GET" && path === "/api/availability") {
      const date = url.searchParams.get("date");
      if (url.searchParams.get("provider") !== PROVIDER_REF || date !== BOOK_DATE) return reply(route, 200, { slots: [], advisory: true });
      return reply(route, 200, {
        slots: [
          { start_at: `${date}T04:30:00+00:00`, end_at: `${date}T05:00:00+00:00`, advisory: true },
          { start_at: `${date}T05:30:00+00:00`, end_at: `${date}T06:00:00+00:00`, advisory: true },
        ],
        advisory: true,
      });
    }
    if (method === "POST" && path === "/api/auth/patient") return reply(route, 200, { patientId: PATIENT_ID });
    if (method === "POST" && path === "/api/patient/addresses") return reply(route, 201, { id: ADDRESS_ID });
    if (method === "POST" && path === "/api/bookings") {
      state.bookingRequests.push({ headers: request.headers(), body });
      booking = {
        id: BOOKING_ID,
        public_ref: "SCV-000000900001",
        provider_reference: PROVIDER_REF,
        category: "doctor",
        service_id: SERVICE_ID,
        pin_code: "500001",
        start_at: body.startAt,
        end_at: body.startAt,
        state: "requested",
        version: 1,
        amount_paise: "150000",
        currency: "INR",
        terms_version: "synthetic-terms-1",
        policy_version_id: null,
        substate: "scheduled",
      };
      return reply(route, 201, { id: BOOKING_ID });
    }
    if (method === "GET" && path === `/api/bookings/${BOOKING_ID}`) return booking ? reply(route, 200, { booking }) : reply(route, 404, { error: { code: "not_found" } });
    if (method === "GET" && path === "/api/bookings") return reply(route, 200, { items: booking ? [booking] : [] });
    if (method === "POST" && path === `/api/bookings/${BOOKING_ID}/cancel`) {
      state.cancelRequests.push(body);
      if (booking) booking = { ...booking, state: "cancelled", version: 2 };
      return reply(route, 200, { version: 2 });
    }
    return reply(route, 404, { error: { code: "not_found" } });
  });
  return state;
}

/** Signs in through the real /sign-in form against the synthetic backend. */
export async function signIn(page: Page, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email address").fill("patient@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-1");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}
