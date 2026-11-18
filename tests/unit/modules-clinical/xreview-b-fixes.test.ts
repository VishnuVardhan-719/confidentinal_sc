import { afterEach, describe, expect, it, vi } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { getClinicalApi } from "@/modules/clinical";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import { appOrigin, parseRetryAfter } from "@/modules/clinical/http-util";
import { amendmentRecordSchema } from "@/modules/clinical/types";
import { getDoctorApi } from "@/modules/doctor";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { createDoctorHttpApi } from "@/modules/doctor/http";
import { decideDoctorAccess } from "@/modules/doctor/routing";
import { describeBookingState, describeVisitPhase } from "@/modules/doctor/status";
import { assignedVisitViewSchema, doctorRequestViewSchema } from "@/modules/doctor/types";
import { allowedVisitActions, splitTodayUpcoming } from "@/modules/doctor/visit";
import { getRecordsApi } from "@/modules/records";
import { createRecordsFixtureApi } from "@/modules/records/fixture";

const ID = "00000000-0000-4000-8000-000000000102";
const T0 = new Date("2026-11-20T04:30:00.000Z");
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("D1 bearer token on every request", () => {
  it("sends Authorization: Bearer and refuses redirects", async () => {
    const fetchImpl = vi.fn(async () => json(200, { version: 4 }));
    await createDoctorHttpApi({ getAccessToken: async () => "tok.en-1", fetchImpl }).enRoute(ID, { expectedVersion: 3 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok.en-1");
    expect(init.redirect).toBe("error");
  });

  it("no session, unsafe token or failed lookup never reaches the network", async () => {
    const fetchImpl = vi.fn(async () => json(200, { version: 4 }));
    const call = (getAccessToken: () => string | null | Promise<string | null>) => createDoctorHttpApi({ getAccessToken, fetchImpl }).enRoute(ID, { expectedVersion: 3 });
    expect(await call(() => null)).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await call(() => "bad token\r\nX-Evil: 1")).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await call(() => Promise.reject(new Error("cookie store down")))).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("D2 per-request origin and session wiring", () => {
  it("getters without a session context fail unauthenticated and do not fetch", async () => {
    const spy = vi.fn(async () => json(200, { version: 1 }));
    vi.stubGlobal("fetch", spy);
    expect(await getDoctorApi({}).arrive(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await getRecordsApi({}).recordCollection(ID, { method: "cash", amountPaise: 100 }, "k")).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses the configured absolute origin", async () => {
    const fetchImpl = vi.fn(async () => json(200, { version: 2 }));
    const api = getDoctorApi({}, { http: { baseUrl: appOrigin({ APP_ORIGIN: "https://surecurevisit.in" }), getAccessToken: () => "t", fetchImpl } });
    await api.arrive(ID, { expectedVersion: 1 });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`https://surecurevisit.in/api/bookings/${ID}/arrive`);
  });

  it("appOrigin accepts only a bare https origin (http only for localhost)", () => {
    expect(appOrigin({ APP_ORIGIN: "https://staging.surecurevisit.in" })).toBe("https://staging.surecurevisit.in");
    expect(appOrigin({ APP_ORIGIN: "http://127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
    for (const bad of [undefined, "http://surecurevisit.in", "https://surecurevisit.in/app", "https://u:p@surecurevisit.in", "https://x.in/?a=1", "not a url"]) {
      expect(() => appOrigin({ APP_ORIGIN: bad })).toThrow();
    }
  });
});

describe("D3 fixture actor comes from the caller, deny by default", () => {
  it("getters with no fixture actor deny everything", async () => {
    const env = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
    expect(await getDoctorApi(env).listVisits()).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await getClinicalApi(env).getConsultation(I.consultationPastFinal)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await getRecordsApi(env).listMyRecords()).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("constructors with no actor deny too", async () => {
    const world = createClinicalWorld(T0);
    expect(await createDoctorFixtureApi({ world }).getVisit(I.bookingToday)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await createRecordsFixtureApi({ world }).getMyRecord(I.consultationPastFinal)).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("an explicit session-derived actor is honoured", async () => {
    const r = await getDoctorApi({ FRONTEND_ADAPTER: "fixture" }, { fixtureActor: { role: "doctor", doctorId: I.doctorAssigned } }).listVisits();
    expect(r.ok).toBe(true);
  });
});

describe("D4 interim guard mirrors requireRole", () => {
  it("incomplete onboarding goes to onboarding except setup pages", () => {
    expect(decideDoctorAccess({ status: "onboarding_required" }, "en", "/en/doctor/visits")).toEqual({ action: "redirect", to: "/en/doctor/onboarding" });
    expect(decideDoctorAccess({ status: "onboarding_required" }, "en", "/en/doctor/profile")).toEqual({ action: "render" });
  });

  it("restricted allows notifications; malformed paths fail closed; expired session adds the reason", () => {
    expect(decideDoctorAccess({ status: "restricted" }, "en", "/en/doctor/notifications")).toEqual({ action: "render" });
    expect(decideDoctorAccess({ status: "restricted" }, "en", "/en/doctor/%73upport")).toEqual({ action: "denied", reason: "restricted" });
    expect(decideDoctorAccess({ status: "restricted" }, "en", "/en/doctor/SUPPORT/../visits")).toEqual({ action: "denied", reason: "restricted" });
    expect(decideDoctorAccess({ status: "unauthenticated", sessionExpired: true }, "en", "/en/doctor/visits")).toEqual({
      action: "redirect",
      to: "/en/login?next=%2Fen%2Fdoctor%2Fvisits&reason=session_expired",
    });
  });
});

describe("D5 fixture constructors refuse production when imported directly", () => {
  it("throws for an injected production env", () => {
    const env = { APP_ENV: "production" };
    expect(() => createDoctorFixtureApi({ env })).toThrow();
    expect(() => createClinicalFixtureApi({ env })).toThrow();
    expect(() => createRecordsFixtureApi({ env })).toThrow();
  });

  it("the real process env wins over an injected non-production env", () => {
    vi.stubEnv("APP_ENV", "production");
    const env = { APP_ENV: "development" };
    expect(() => createDoctorFixtureApi({ env })).toThrow();
    expect(() => createClinicalFixtureApi({ env })).toThrow();
    expect(() => createRecordsFixtureApi({ env })).toThrow();
  });
});

describe("D6 doctor DTO schemas tolerate unknown statuses", () => {
  const visit = {
    kind: "assigned",
    bookingId: ID,
    publicReference: "SYN-BKG-0102",
    state: "on_hold_v2",
    phase: "teleported",
    serviceName: "Home doctor visit (synthetic)",
    scheduledStartAt: "2026-11-20T05:00:00.000Z",
    patient: { displayName: "Fixture Patient A", ageYears: 41 },
    contactPhone: "+910000000000",
    address: { line1: "Flat 0", locality: "Synthetic Nagar", pin: "500001" },
    amountPaise: 80000,
    paymentState: "DUE",
    hasKnownAllergies: null,
    consultationId: null,
    version: 3,
  };

  it("unknown state/phase parse to 'unknown': neutral badge, no actions, still listed", () => {
    const v = assignedVisitViewSchema.parse(visit);
    expect([v.state, v.phase]).toEqual(["unknown", "unknown"]);
    expect(describeBookingState(v.state).tone).toBe("neutral");
    expect(describeVisitPhase(v.phase).labelKey).toBe("common.status.unknown");
    expect(allowedVisitActions(v)).toEqual([]);
    // Deliberate: an unrecognised state is not assumed terminal, so the doctor still sees the visit.
    expect(splitTodayUpcoming([v], T0).today).toHaveLength(1);
  });

  it("known values pass through; malformed fields and unknown payment states reject the DTO", () => {
    expect(assignedVisitViewSchema.parse({ ...visit, state: "confirmed", phase: "en_route" })).toMatchObject({ state: "confirmed", phase: "en_route" });
    expect(assignedVisitViewSchema.safeParse({ ...visit, contactPhone: "12345" }).success).toBe(false);
    expect(assignedVisitViewSchema.safeParse({ ...visit, paymentState: "MAYBE_PAID" }).success).toBe(false);
    expect(assignedVisitViewSchema.safeParse({ ...visit, amountPaise: 800.5 }).success).toBe(false);
    const req = { kind: "request", bookingId: ID, publicReference: null, state: "requested", serviceName: "S", scheduledStartAt: "2026-11-20T05:00:00Z", area: { locality: "L", pin: "500001" }, quotedAmountPaise: 80000, respondBy: null, version: 2 };
    expect(doctorRequestViewSchema.safeParse(req).success).toBe(true);
    // Pre-accept DTO must not carry identity/contact fields.
    expect(doctorRequestViewSchema.safeParse({ ...req, contactPhone: "+910000000000" }).success).toBe(false);
  });
});

describe("D7 Retry-After as seconds or HTTP-date", () => {
  it("parses both forms and clamps past dates to 0", () => {
    expect(parseRetryAfter("120", T0)).toBe(120);
    expect(parseRetryAfter("Fri, 20 Nov 2026 04:31:30 GMT", T0)).toBe(90);
    expect(parseRetryAfter("Fri, 20 Nov 2026 04:00:00 GMT", T0)).toBe(0);
    expect(parseRetryAfter("soon", T0)).toBeUndefined();
    expect(parseRetryAfter("-5", T0)).toBeUndefined();
    expect(parseRetryAfter(null, T0)).toBeUndefined();
  });

  it("the http adapter surfaces an HTTP-date Retry-After", async () => {
    const api = createDoctorHttpApi({ getAccessToken: () => "t", now: () => T0, fetchImpl: async () => json(429, {}, { "Retry-After": "Fri, 20 Nov 2026 04:30:45 GMT" }) });
    expect(await api.arrive(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "rate_limited", retryAfterSeconds: 45 } });
  });
});

describe("D8 amendment reason text is bounded in responses", () => {
  const rec = { version: 2, previousVersion: 1, reason: "correction", amendedAt: "2026-11-20T04:30:00.000Z", amendedBy: { clinicianId: "d", displayName: "Dr", registrationLabel: null } };
  it("rejects empty and oversized reason text", () => {
    expect(amendmentRecordSchema.safeParse({ ...rec, reasonText: "Synthetic correction reason" }).success).toBe(true);
    expect(amendmentRecordSchema.safeParse({ ...rec, reasonText: "   " }).success).toBe(false);
    expect(amendmentRecordSchema.safeParse({ ...rec, reasonText: "x".repeat(2001) }).success).toBe(false);
  });
});
