import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, errorMessage, withQuery } from "@/lib/client/api";
import { getTokens, setTokens } from "@/lib/client/session";
import { toAccount } from "@/lib/client/account";
import {
  bookHref,
  canCancel,
  catalogPageSchema,
  prefillFromParams,
  splitBookings,
  type Booking,
} from "@/lib/client/booking";
import { formatPaise, formatSlot, istDate } from "@/lib/client/format";
import { uuid } from "@/lib/client/uuid";

/* Browser API client against stubbed fetch and sessionStorage: no network and no database. */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let calls: Call[];
let answers: Response[];

beforeEach(() => {
  calls = [];
  answers = [];
  vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = answers.shift();
      if (!next) throw new TypeError("no answer queued");
      return next;
    }),
  );
  setTokens(null);
});

afterEach(() => {
  setTokens(null);
  vi.unstubAllGlobals();
});

const headers = (c: Call) => c.init.headers as Record<string, string>;

describe("api()", () => {
  it("builds query strings and drops empty values", () => {
    expect(withQuery("/api/catalog", { category: "doctor", pin: "500001", cursor: null, limit: 20 })).toBe(
      "/api/catalog?category=doctor&pin=500001&limit=20",
    );
    expect(withQuery("/api/x")).toBe("/api/x");
  });

  it("sends the bearer token and idempotency key, never cookies", async () => {
    setTokens({ accessToken: "acc-1", refreshToken: "ref-1" });
    answers.push(json(201, { id: "b" }));
    await api("/api/bookings", { method: "POST", auth: true, idempotencyKey: "key-1", body: { a: 1 } });
    expect(headers(calls[0]!).Authorization).toBe("Bearer acc-1");
    expect(headers(calls[0]!)["Idempotency-Key"]).toBe("key-1");
    expect(headers(calls[0]!)["Content-Type"]).toBe("application/json");
    expect(calls[0]!.init.credentials).toBe("omit");
    expect(calls[0]!.init.body).toBe('{"a":1}');
  });

  it("refuses an authenticated call without a session, without touching the network", async () => {
    await expect(api("/api/bookings", { auth: true })).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    expect(calls).toHaveLength(0);
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    setTokens({ accessToken: "old", refreshToken: "ref-1" });
    answers.push(json(401, { error: { code: "unauthenticated" } }));
    answers.push(json(200, { accessToken: "new", refreshToken: "ref-2", expiresAt: 4_102_444_800 }));
    answers.push(json(200, { items: [] }));
    await expect(api("/api/bookings", { auth: true })).resolves.toEqual({ items: [] });
    expect(calls.map((c) => c.url)).toEqual(["/api/bookings", "/api/auth/refresh", "/api/bookings"]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ refreshToken: "ref-1" });
    expect(headers(calls[2]!).Authorization).toBe("Bearer new");
    expect(getTokens()?.refreshToken).toBe("ref-2");
  });

  it("signs the tab out when the refresh token is rejected", async () => {
    setTokens({ accessToken: "old", refreshToken: "ref-1" });
    answers.push(json(401, { error: { code: "unauthenticated" } }));
    answers.push(json(401, { error: { code: "invalid_session" } }));
    await expect(api("/api/bookings", { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(getTokens()).toBeNull();
  });

  it("turns error bodies and network failures into ApiError", async () => {
    answers.push(json(409, { error: { code: "conflict" } }));
    await expect(api("/api/x")).rejects.toMatchObject({ status: 409, code: "conflict" });
    answers.push(new Response("<html>", { status: 502 }));
    await expect(api("/api/x")).rejects.toMatchObject({ status: 502, code: "unknown_error" });
    await expect(api("/api/x")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("explains failures in plain language", () => {
    expect(errorMessage(new ApiError(0, "network_error"))).toMatch(/could not reach/);
    expect(errorMessage(new ApiError(401, "invalid_credentials"))).toMatch(/do not match/);
    expect(errorMessage(new ApiError(429, "rate_limited"))).toMatch(/Too many/);
    expect(errorMessage(new ApiError(503, "booking_unavailable"))).toMatch(/not available right now/);
    expect(errorMessage(new Error("x"))).toMatch(/Something went wrong/);
  });
});

describe("account", () => {
  it("keeps only known roles from /api/auth/me", () => {
    const account = toAccount({ profile: { id: "p", display_name: "Asha", locale: "te", version: 3 }, roles: ["patient", "root"] });
    expect(account).toEqual({ id: "p", name: "Asha", locale: "te", version: 3, roles: ["patient"] });
    expect(() => toAccount({ profile: { id: "p" }, roles: [] })).toThrow();
  });
});

describe("booking helpers", () => {
  const booking = (patch: Partial<Booking>): Booking => ({
    id: "11111111-1111-4111-8111-111111111111",
    public_ref: "SCV-000000000001",
    provider_reference: "SCV-DOC-000001",
    category: "doctor",
    service_id: "22222222-2222-4222-8222-222222222222",
    pin_code: "500001",
    start_at: "2099-12-02T04:30:00+00:00",
    end_at: "2099-12-02T05:00:00+00:00",
    state: "requested",
    version: 2,
    amount_paise: "150000",
    currency: "INR",
    ...patch,
  });

  it("keeps only well-formed values from a booking link", () => {
    const ok = new URLSearchParams({
      category: "scheduled-ambulance",
      pin: "500001",
      provider: "SCV-AMB-000123",
      service: "22222222-2222-4222-8222-222222222222",
    });
    expect(prefillFromParams(ok)).toEqual({
      service: "scheduled-ambulance",
      pin: "500001",
      provider: "SCV-AMB-000123",
      serviceId: "22222222-2222-4222-8222-222222222222",
    });
    expect(prefillFromParams(new URLSearchParams({ category: "doctor", pin: "012345", provider: "<script>" }))).toEqual({
      service: "doctor",
    });
    expect(prefillFromParams(null)).toEqual({});
  });

  it("links a catalog row to /book with the public reference, never a private id", () => {
    const href = bookHref("lab", "500001", { provider_reference: "SCV-LAB-000009", service_id: "s-1" });
    expect(href).toBe("/book?category=lab&pin=500001&provider=SCV-LAB-000009&service=s-1");
  });

  it("splits open and closed requests by state and offers cancel only for future open ones", () => {
    const { upcoming, past } = splitBookings([
      booking({ state: "cancelled" }),
      booking({ state: "confirmed", start_at: "2099-12-01T04:30:00+00:00" }),
      booking({ state: "requested" }),
    ]);
    expect(upcoming.map((b) => b.state)).toEqual(["confirmed", "requested"]);
    expect(past.map((b) => b.state)).toEqual(["cancelled"]);
    expect(canCancel(booking({}))).toBe(true);
    expect(canCancel(booking({ state: "in_progress" }))).toBe(false);
    expect(canCancel(booking({ start_at: "2001-01-01T00:00:00Z" }))).toBe(false);
  });

  it("parses catalog rows and rejects a row without a public reference", () => {
    const row = {
      provider_reference: "SCV-DOC-000001",
      category: "doctor",
      display_name: "Clinic",
      public_profile: { category: "doctor", display_name: "Clinic" },
      service_id: "22222222-2222-4222-8222-222222222222",
      service_title: "Home visit",
      duration_minutes: 30,
      amount_paise: "150000",
      currency: "INR",
      unit: "visit",
      terms_version: "t1",
      pin_code: "500001",
      city: "Hyderabad",
      advisory_availability: null,
    };
    expect(catalogPageSchema.parse({ results: [row], nextCursor: null }).results).toHaveLength(1);
    expect(catalogPageSchema.safeParse({ results: [{ ...row, provider_reference: "uuid-here" }] }).success).toBe(false);
  });
});

describe("formatting", () => {
  it("shows server paise as rupees without changing the amount", () => {
    expect(formatPaise("150000")).toBe("₹1,500");
    expect(formatPaise("150050")).toBe("₹1,500.50");
    expect(formatPaise("0")).toBe("₹0");
    expect(formatPaise("-1")).toBe("Price unavailable");
  });
  it("formats instants in India time", () => {
    expect(formatSlot("2026-12-02T04:30:00.000Z")).toBe("Wed, 2 Dec, 10:00 am IST");
    expect(istDate(0, new Date("2026-12-01T20:00:00Z"))).toBe("2026-12-02");
  });
  it("makes v4 idempotency keys", () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
