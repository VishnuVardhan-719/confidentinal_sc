import { describe, expect, it } from "vitest";
import { extractOtpFromPaste, normalizeOtpInput, otpVerifySchema, toAsciiDigits } from "@/modules/auth/schemas";
import { runLogin, runSignup, type AuthDeps } from "@/modules/auth/flows";
import { createFixtureAuthApi } from "@/modules/auth/fixture";
import { canAccessRoute } from "@/modules/auth/routes";
import type { AuthApi } from "@/modules/auth/api";
import { createFixtureOrganizationsApi, createHttpOrganizationsApi } from "@/modules/organizations/api";
import type { FetchLike } from "@/modules/auth/http-client";
import { providerReadiness } from "@/modules/onboarding/readiness";
import { fieldVisibility, previewGroups } from "@/modules/onboarding/visibility";
import { providerCompletion, type ProviderOnboardingDraft } from "@/modules/onboarding/provider";
import { createFixtureOnboardingApi, createFixtureOnboardingStore } from "@/modules/onboarding/fixture";
import { loadProviderOnboarding } from "@/modules/onboarding/loaders";
import { createHttpOnboardingApi } from "@/modules/onboarding/http";
import { FIXTURE_IDS, FIXTURE_SESSIONS } from "@/fixtures/identity";

/**
 * Gaps found reviewing the identity modules against FRONTEND_MASTER s8 (signup/login/
 * onboarding), s15 (staff/admin) and s19 (error/security rules).
 */

const DEV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "development" };
const NOW = new Date("2026-11-18T00:00:00Z");

describe("s8 OTP: paste and autofill, including te/hi keyboards", () => {
  it("maps Telugu, Devanagari, Arabic-Indic and full-width digits to ASCII", () => {
    expect(toAsciiDigits("౨౪౬౮౧౦")).toBe("246810");
    expect(toAsciiDigits("२४६८१०")).toBe("246810");
    expect(toAsciiDigits("٢٤٦٨١٠")).toBe("246810");
    expect(toAsciiDigits("２４６８１０")).toBe("246810");
    expect(normalizeOtpInput("२४६ ८१०")).toBe("246810");
    expect(otpVerifySchema.safeParse({ challengeId: "c", code: "౨౪౬-౮౧౦" }).success).toBe(true);
  });

  it("extracts a code from pasted SMS text only when unambiguous", () => {
    expect(extractOtpFromPaste("246810")).toBe("246810");
    expect(extractOtpFromPaste("Your SureCure code is 246 810. Valid for 5 min.")).toBe("246810");
    expect(extractOtpFromPaste("Code 246810 or 135790")).toBeNull();
    expect(extractOtpFromPaste("Call 1800123456789")).toBeNull();
    expect(extractOtpFromPaste("no digits here")).toBeNull();
  });
});

describe("s8 network error and already-exists states", () => {
  const depsWith = (api: AuthApi): AuthDeps => ({
    api,
    writeTokens: () => true,
    clearTokens: () => undefined,
    sessionFor: async () => ({ ok: false, error: { code: "unavailable" } }),
  });

  it("network failure is a retryable unavailable state, not invalid credentials", async () => {
    const base = createFixtureAuthApi({ env: DEV });
    const offline: AuthApi = { ...base, login: async () => ({ ok: false, error: { code: "unavailable" } }) };
    const fd = new FormData();
    fd.set("email", "patient.complete@example.invalid");
    fd.set("password", "x");
    expect(await runLogin(depsWith(offline), fd)).toMatchObject({ status: "error", errorKey: "errors.unavailable" });
  });

  it("server conflict on signup maps to the account-exists message", async () => {
    const base = createFixtureAuthApi({ env: DEV });
    const exists: AuthApi = { ...base, signup: async () => ({ ok: false, error: { code: "conflict" } }) };
    expect(await runSignup(depsWith(exists), new FormData())).toMatchObject({ errorKey: "auth.errors.accountExists" });
  });

  it("session lookup failure after sign-in does not leave a half session", async () => {
    let cleared = 0;
    const deps: AuthDeps = {
      ...depsWith(createFixtureAuthApi({ env: DEV })),
      sessionFor: async () => ({ ok: true, data: { kind: "anonymous" } }),
      clearTokens: () => {
        cleared += 1;
      },
    };
    const fd = new FormData();
    fd.set("email", "patient.complete@example.invalid");
    fd.set("password", "x");
    expect((await runLogin(deps, fd)).status).toBe("error");
    expect(cleared).toBe(1);
  });
});

describe("s8 emergency access never depends on onboarding or login", () => {
  it("/emergency is open to anonymous, incomplete and restricted sessions", () => {
    for (const s of [FIXTURE_SESSIONS.anonymous, FIXTURE_SESSIONS.patient_new, FIXTURE_SESSIONS.account_disabled, FIXTURE_SESSIONS.caretaker_suspended]) {
      expect(canAccessRoute(s, "/en/emergency").allowed).toBe(true);
      expect(canAccessRoute(s, "/te/emergency").allowed).toBe(true);
    }
  });
});

describe("s8/s15 staff invitations", () => {
  it("http maps I01 invitations and drops unknown scopes", async () => {
    const f: FetchLike = async () =>
      new Response(JSON.stringify({ invitations: [{ organization_id: FIXTURE_IDS.labOrganization, scopes: ["org:read", "superpower"], version: 2 }] }));
    const r = await createHttpOrganizationsApi({ fetch: f, getAccessToken: () => "t" }).listInvitations();
    expect(r).toEqual({ ok: true, data: [{ organizationId: FIXTURE_IDS.labOrganization, scopes: ["org:read"], version: 2 }] });
  });

  it("accept validates IDs before any request and uses the I01 route with version", async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ membershipId: "00000000-0000-4000-8000-00000000abcd" }));
    };
    const api = createHttpOrganizationsApi({ fetch: f, getAccessToken: () => "t" });
    expect((await api.acceptInvitation("../admin", 1)).ok).toBe(false);
    expect((await api.acceptInvitation(FIXTURE_IDS.labOrganization, 0)).ok).toBe(false);
    expect(calls).toEqual([]);
    expect((await api.acceptInvitation(FIXTURE_IDS.labOrganization, 1)).ok).toBe(true);
    expect(calls).toEqual([`/api/organizations/${FIXTURE_IDS.labOrganization}/members/accept`]);
  });

  it("fixture: stale version conflicts, accepted invite cannot be reused", async () => {
    const api = createFixtureOrganizationsApi({ env: DEV });
    const list = await api.listInvitations();
    if (!list.ok) throw new Error("list");
    const [invite] = list.data;
    expect(await api.acceptInvitation(invite.organizationId, invite.version + 1)).toEqual({ ok: false, error: { code: "conflict" } });
    expect((await api.acceptInvitation(invite.organizationId, invite.version)).ok).toBe(true);
    expect(await api.acceptInvitation(invite.organizationId, invite.version)).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

const doctorDraft = (evidence: ProviderOnboardingDraft["evidence"], status: ProviderOnboardingDraft["status"] = "draft"): ProviderOnboardingDraft => ({
  category: "doctor",
  providerId: FIXTURE_IDS.doctorDraftProvider,
  status,
  version: 1,
  updatedAt: null,
  sections: { availability: { weeklyHours: [{ day: "mon", opens: "09:00", closes: "10:00" }] } },
  evidence,
});

describe("s8 separate readiness dimensions", () => {
  const ev = (status: "pending" | "verified" | "rejected" | "superseded", expiresAt: string) => ({
    documentId: "00000000-0000-4000-8000-00000000e001",
    kind: "registration" as const,
    status,
    expiresAt,
  });

  it("credential review is independent of profile completeness", () => {
    const missing = doctorDraft([]);
    const r = providerReadiness(missing, providerCompletion("doctor", missing.sections), NOW);
    expect(r).toMatchObject({ profile: "incomplete", credentials: "missing", availability: "set", activation: "inactive", suspended: false });
    const states: Array<[ReturnType<typeof ev>[], string]> = [
      [[ev("pending", "2029-01-01T00:00:00Z")], "pending"],
      [[ev("verified", "2029-01-01T00:00:00Z")], "verified"],
      [[ev("verified", "2026-12-01T00:00:00Z")], "expiring_soon"],
      [[ev("verified", "2026-11-01T00:00:00Z")], "expired"],
      [[ev("rejected", "2029-01-01T00:00:00Z")], "rejected"],
      [[ev("superseded", "2029-01-01T00:00:00Z")], "missing"],
    ];
    for (const [evidence, expected] of states) {
      const d = doctorDraft(evidence);
      expect(providerReadiness(d, providerCompletion("doctor", d.sections), NOW).credentials, expected).toBe(expected);
    }
  });

  it("activation only for active; suspension flagged separately", () => {
    const active = doctorDraft([ev("verified", "2029-01-01T00:00:00Z")], "active");
    expect(providerReadiness(active, providerCompletion("doctor", active.sections), NOW).activation).toBe("active");
    const approved = doctorDraft([], "approved");
    expect(providerReadiness(approved, providerCompletion("doctor", approved.sections), NOW).activation).toBe("inactive");
    const suspended = doctorDraft([], "suspended");
    expect(providerReadiness(suspended, providerCompletion("doctor", suspended.sections), NOW).suspended).toBe(true);
  });

  it("loader summary carries readiness; registration in fixture shows pending evidence", async () => {
    const api = createFixtureOnboardingApi({ env: DEV, store: createFixtureOnboardingStore() });
    const workspaces = FIXTURE_SESSIONS.doctor_draft.kind === "authenticated" ? FIXTURE_SESSIONS.doctor_draft.identity.workspaces : [];
    await api.registerProviderDocument(FIXTURE_IDS.doctorDraftProvider, {
      kind: "registration",
      contentType: "application/pdf",
      expiresAt: "2099-01-01T00:00:00Z",
      expectedVersion: 2,
    });
    const view = await loadProviderOnboarding(api, "doctor", workspaces, "en");
    if (view.kind !== "ready") throw new Error("ready");
    expect(view.summary.readiness.credentials).toBe("pending");
    expect(view.summary.readiness.profile).toBe("incomplete");
  });

  it("http draft keeps evidence status from I02 (rejected stays visible)", async () => {
    const f: FetchLike = async () =>
      new Response(
        JSON.stringify({
          provider: {
            id: FIXTURE_IDS.doctorDraftProvider, category: "doctor", verification_state: "rejected", status: "inactive", version: 3,
            profile: null,
            documents: [{ id: "00000000-0000-4000-8000-00000000e002", kind: "registration", status: "rejected", expires_at: "2029-01-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z" }],
            events: [],
          },
        }),
      );
    const draft = await createHttpOnboardingApi({ fetch: f, getAccessToken: () => "t" }).getProviderDraft(FIXTURE_IDS.doctorDraftProvider);
    if (!draft.ok) throw new Error("draft");
    expect(draft.data.evidence).toEqual([{ documentId: "00000000-0000-4000-8000-00000000e002", kind: "registration", status: "rejected", expiresAt: "2029-01-01T00:00:00Z" }]);
    expect(draft.data.sections).not.toHaveProperty("documents");
    expect(providerReadiness(draft.data, providerCompletion("doctor", draft.data.sections), NOW).credentials).toBe("rejected");
  });
});

describe("s8 review screen: public preview vs private verification fields", () => {
  it("home location, contacts, crew and evidence are private; unknown paths default private", () => {
    expect(fieldVisibility("doctor", "practice.startingPoint")).toBe("private");
    expect(fieldVisibility("doctor", "practice.homeVisitFeePaise")).toBe("public");
    expect(fieldVisibility("doctor", "identity.registrationNumber")).toBe("after_verification");
    expect(fieldVisibility("doctor", "identity.specialty")).toBe("public");
    expect(fieldVisibility("doctor", "documents.documents")).toBe("private");
    expect(fieldVisibility("lab", "organization.managerPhone")).toBe("private");
    expect(fieldVisibility("lab", "organization.brandName")).toBe("public");
    expect(fieldVisibility("ambulance", "operator.contactPhone")).toBe("private");
    expect(fieldVisibility("ambulance", "crew.drivers")).toBe("private");
    expect(fieldVisibility("caretaker", "skills.nursingCredential")).toBe("private");
    expect(fieldVisibility("caretaker", "somethingNew.field")).toBe("private");
  });

  it("groups saved fields and ignores unknown sections", () => {
    const groups = previewGroups("doctor", {
      listing: { displayName: "Synthetic Doctor", description: "" },
      practice: { homeVisitFeePaise: 80_000, servicePins: ["500001"], travelRadiusKm: 5, startingPoint: { pinCode: "500001", locality: "X" } },
      bogus: { secret: "x" },
    });
    expect(groups.public.map((f) => f.path)).toEqual([
      "listing.displayName",
      "listing.description",
      "practice.homeVisitFeePaise",
      "practice.servicePins",
      "practice.travelRadiusKm",
    ]);
    expect(groups.private.map((f) => f.path)).toEqual(["practice.startingPoint"]);
    expect(JSON.stringify(groups)).not.toContain("secret");
  });
});
