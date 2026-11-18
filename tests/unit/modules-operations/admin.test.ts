import { describe, expect, it, vi } from "vitest";
import { adminFixtures, adminPrincipals } from "@/fixtures/operations/admin";
import { ADMIN_CAPABILITIES, can, globalCapabilities, type AdminPrincipal } from "@/modules/admin/capabilities";
import { createAdminFixtureApi } from "@/modules/admin/fixture";
import { createAdminHttpApi } from "@/modules/admin/http";
import {
  allowedReviewDecisions,
  canManageAdmin,
  coverageDecisionDenial,
  gateSettings,
  isBookableCoverage,
  normalizeBookingReference,
  reviewDecisionDenial,
} from "@/modules/admin/rules";
import { describePayment, describeVerification } from "@/modules/admin/status";

const NOW = new Date("2026-11-20T00:00:00Z");
const base: AdminPrincipal = { profileId: "p1", status: "active", mfaVerified: true, grants: [] };
const grant = (over: Partial<AdminPrincipal["grants"][number]> = {}) => ({
  capability: "provider:verify" as const,
  scope: { kind: "global" as const },
  grantedAt: "2026-11-01T00:00:00Z",
  expiresAt: null,
  revokedAt: null,
  ...over,
});

describe("admin capability model is deny-by-default", () => {
  it("denies with no principal, no grants or an unknown capability", () => {
    for (const cap of ADMIN_CAPABILITIES) {
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
      expect(can(base, cap)).toBe(false);
    }
    expect(can({ ...base, grants: [grant()] }, "superuser")).toBe(false);
    expect(can({ ...base, grants: [grant()] }, "")).toBe(false);
    expect(globalCapabilities(base)).toEqual([]);
  });

  it("denies without MFA, when not active, or when the grant is revoked/expired", () => {
    const g = [grant()];
    expect(can({ ...base, grants: g }, "provider:verify", { now: NOW })).toBe(true);
    expect(can({ ...base, mfaVerified: false, grants: g }, "provider:verify", { now: NOW })).toBe(false);
    for (const status of ["invited", "suspended", "revoked"] as const) {
      expect(can({ ...base, status, grants: g }, "provider:verify", { now: NOW })).toBe(false);
    }
    expect(can({ ...base, grants: [grant({ revokedAt: "2026-11-10T00:00:00Z" })] }, "provider:verify", { now: NOW })).toBe(false);
    expect(can({ ...base, grants: [grant({ expiresAt: "2026-11-19T00:00:00Z" })] }, "provider:verify", { now: NOW })).toBe(false);
    expect(can({ ...base, grants: [grant({ expiresAt: "not-a-date" })] }, "provider:verify", { now: NOW })).toBe(false);
  });

  it("does not let one capability imply another", () => {
    const p = { ...base, grants: [grant()] };
    expect(can(p, "coverage:verify", { now: NOW })).toBe(false);
    expect(can(p, "membership:admin", { now: NOW })).toBe(false);
  });

  it("organization-scoped grants apply only to that organization", () => {
    const p = { ...base, grants: [grant({ capability: "security:audit", scope: { kind: "organization", organizationId: "org-a" } })] };
    expect(can(p, "security:audit", { now: NOW })).toBe(false);
    expect(can(p, "security:audit", { organizationId: "org-b", now: NOW })).toBe(false);
    expect(can(p, "security:audit", { organizationId: "org-a", now: NOW })).toBe(true);
  });

  it("fixture API returns forbidden for areas the principal lacks", async () => {
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.noGrants });
    expect(await api.listProviderReviews()).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await api.listPayments()).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await api.getSettings()).toEqual({ ok: false, error: { code: "forbidden" } });
    const anonymous = createAdminFixtureApi({ env: {}, principal: null });
    expect(await anonymous.listCoverage()).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("no self-approval", () => {
  const lab2 = adminFixtures.reviews.find((r) => r.providerId === "fx-prov-lab-2")!;

  it("rule denies an admin who is an applicant of the provider", () => {
    expect(reviewDecisionDenial(adminPrincipals.applicantAdmin, lab2, "approved", "ok", NOW)).toBe("self_approval");
    expect(reviewDecisionDenial(adminPrincipals.applicantAdmin, lab2, "rejected", "no", NOW)).toBe("self_approval");
    expect(reviewDecisionDenial(adminPrincipals.verifier, lab2, "approved", "Evidence checked.", NOW)).toBeNull();
  });

  it("fixture API returns forbidden and leaves state unchanged", async () => {
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.applicantAdmin, now: () => NOW });
    const result = await api.decideProviderReview({ providerId: lab2.providerId, decision: "approved", reason: "self", expectedVersion: lab2.version, idempotencyKey: "s1" });
    expect(result).toEqual({ ok: false, error: { code: "forbidden" } });
    const detail = await api.getProviderReview(lab2.providerId);
    expect(detail.ok && detail.data.verificationState).toBe("under_review");
  });

  it("decision needs a reason and a valid I02 transition", async () => {
    expect(allowedReviewDecisions("under_review").sort()).toEqual(["approved", "rejected"]);
    expect(allowedReviewDecisions("draft")).toEqual([]);
    expect(reviewDecisionDenial(adminPrincipals.verifier, lab2, "approved", "   ", NOW)).toBe("reason_required");
    expect(reviewDecisionDenial(adminPrincipals.verifier, { ...lab2, verificationState: "draft" }, "approved", "x", NOW)).toBe("invalid_transition");
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier, now: () => NOW });
    const ok = await api.decideProviderReview({ providerId: lab2.providerId, decision: "approved", reason: "Checked.", expectedVersion: lab2.version, idempotencyKey: "v1" });
    expect(ok).toEqual({ ok: true, data: { providerId: lab2.providerId, verificationState: "approved", version: lab2.version + 1 } });
  });
});

describe("coverage, booking ops and access", () => {
  it("approval requires reason and validUntil within a year; changes are recorded", async () => {
    const proposed = { status: "proposed" as const };
    expect(coverageDecisionDenial(adminPrincipals.verifier, proposed, "approved", "ok", undefined, NOW)).toBe("valid_until_required");
    expect(coverageDecisionDenial(adminPrincipals.verifier, proposed, "approved", "ok", "2028-01-01T00:00:00Z", NOW)).toBe("valid_until_required");
    expect(coverageDecisionDenial(adminPrincipals.verifier, proposed, "revoked", "ok", undefined, NOW)).toBe("invalid_transition");
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier, now: () => NOW });
    const res = await api.decideCoverage({ areaId: "fx-area-1", decision: "approved", reason: "Verified base.", validUntil: "2027-06-01T00:00:00Z", expectedVersion: 1, idempotencyKey: "c1" });
    expect(res.ok && res.data.status).toBe("approved");
    const history = await api.listCoverageHistory("fx-area-1");
    expect(history.ok && history.data).toHaveLength(1);
  });

  it("only approved providers in approved, in-window PINs are bookable", () => {
    const area = { status: "approved" as const, validFrom: "2026-11-01T00:00:00Z", validTo: "2027-11-01T00:00:00Z" };
    expect(isBookableCoverage("approved", area, NOW)).toBe(true);
    expect(isBookableCoverage("under_review", area, NOW)).toBe(false);
    expect(isBookableCoverage("approved", { ...area, status: "proposed" }, NOW)).toBe(false);
    expect(isBookableCoverage("approved", { ...area, validTo: "2026-11-10T00:00:00Z" }, NOW)).toBe(false);
    expect(isBookableCoverage("approved", { ...area, validTo: null }, NOW)).toBe(false);
  });

  it("booking search accepts only a canonical reference", () => {
    expect(normalizeBookingReference(" scv-bkg-000142 ")).toBe("#SCV-BKG-000142");
    expect(normalizeBookingReference("#SCV-BKG-000142")).toBe("#SCV-BKG-000142");
    expect(normalizeBookingReference("patient name")).toBeNull();
    expect(normalizeBookingReference("#SCV-BKG-1")).toBeNull();
  });

  it("admins cannot change their own grants", () => {
    expect(canManageAdmin(adminPrincipals.superAdmin, "fx-adm-verifier", NOW)).toBe(true);
    expect(canManageAdmin(adminPrincipals.superAdmin, adminPrincipals.superAdmin.profileId, NOW)).toBe(false);
    expect(canManageAdmin(adminPrincipals.verifier, "someone", NOW)).toBe(false);
  });

  it("settings are a read-only display of server gates, all off by default", () => {
    const view = gateSettings({});
    expect(view.gates.every((g) => g.enabled === false && g.editable === false)).toBe(true);
    expect(gateSettings({ FEATURE_LIVE_PAYMENTS: "true" }).gates.find((g) => g.flag === "livePayments")?.enabled).toBe(true);
  });

  it("unknown verification/payment statuses never read as approved/paid", () => {
    expect(describeVerification("verified").known).toBe(false); // I01 legacy value is not mapped silently
    expect(describeVerification("ACTIVE").tone).toBe("neutral");
    expect(describePayment("captured").known).toBe(false);
  });
});

describe("admin http adapter", () => {
  it("posts the documented review contract and maps the response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ provider: { id: "p-1", verification_state: "approved", version: 5, extra_private: "x" } }), { status: 200 }),
    );
    const api = createAdminHttpApi({ fetchImpl, baseUrl: "https://staging.invalid", env: {} });
    const result = await api.decideProviderReview({ providerId: "p/1", decision: "approved", reason: " Checked ", expectedVersion: 4, idempotencyKey: "idem-1" });
    expect(result).toEqual({ ok: true, data: { providerId: "p-1", verificationState: "approved", version: 5 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://staging.invalid/api/admin/providers/p%2F1/review");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "approved", reason: "Checked", expectedVersion: 4 });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
  });

  it("maps HTTP errors to stable codes and never exposes server text", async () => {
    const respond = (status: number) => createAdminHttpApi({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: "invalid_transition", detail: "secret" } }), { status }), env: {} });
    const input = { providerId: "p", decision: "approved" as const, reason: "x", expectedVersion: 1, idempotencyKey: "k" };
    expect(await respond(403).decideProviderReview(input)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await respond(409).decideProviderReview(input)).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await respond(422).decideProviderReview(input)).toEqual({ ok: false, error: { code: "validation" } });
    expect(await respond(500).decideProviderReview(input)).toEqual({ ok: false, error: { code: "unavailable" } });
    const offline = createAdminHttpApi({ fetchImpl: async () => { throw new Error("network"); }, env: {} });
    expect(await offline.decideProviderReview(input)).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it("rejects an empty reason before calling the server and gates undocumented areas", async () => {
    const fetchImpl = vi.fn();
    const api = createAdminHttpApi({ fetchImpl, env: {} });
    const res = await api.decideProviderReview({ providerId: "p", decision: "approved", reason: "  ", expectedVersion: 1, idempotencyKey: "k" });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await api.listProviderReviews()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.listPayments()).toEqual({ ok: false, error: { code: "gated" } });
  });
});
