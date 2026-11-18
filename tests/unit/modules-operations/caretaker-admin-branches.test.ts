import { describe, expect, it } from "vitest";
import type { ApiResult } from "@/lib/api/result";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { careActors, caretakerFixtures } from "@/fixtures/operations/caretaker";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { decideAdminAccess, metricFrom, toLoaderResult } from "@/modules/admin/access";
import { globalCapabilities, isAdminCapability } from "@/modules/admin/capabilities";
import { createAdminFixtureApi } from "@/modules/admin/fixture";
import { createHttpClient, paiseFromServer } from "@/modules/admin/http-util";
import { loadAdminUsers, loadAudit, loadBookingExceptions, loadSupportQueue } from "@/modules/admin/loaders";
import { adminInviteSchema, coverageDecisionDenial, filterProviderReviews, isBookableCoverage } from "@/modules/admin/rules";
import { describeAdminStatus, describeGate, describeInvite, describePriority, describeRefund, describeSupport } from "@/modules/admin/status";
import { toAdminDashboard, toSupportRow } from "@/modules/admin/view-models";
import { listWorkspaces } from "@/modules/admin/workspace";
import { createCaretakerFixtureApi } from "@/modules/caretaker/fixture";
import { loadAssignmentDetail, loadCareRequests, loadCareServices } from "@/modules/caretaker/loaders";
import { caregiverAssignable, careActionDenial, careRequestSchema, nextShiftAttendance, replacementAllowed } from "@/modules/caretaker/rules";
import { describeCare, describeCredential, describeRatePeriod, describeShift } from "@/modules/caretaker/status";
import { recurringPlansVM } from "@/modules/caretaker/view-models";
import { z } from "zod";

const data = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.data;
};
const code = <T>(r: ApiResult<T>) => (r.ok ? "ok" : r.error.code);
const NOW = new Date("2026-11-20T04:00:00Z");
const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };

describe("caretaker rules: remaining branches", () => {
  const [cgA, cgB, cgC] = caretakerFixtures.staff;
  const absent = caretakerFixtures.shifts[2];

  it("request schema rejects inverted intervals and unsupported periods", () => {
    const base = { serviceId: "s", taskCodes: ["companionship"], period: "hour", start: "2026-11-22T03:30:00Z", end: "2026-11-22T07:30:00Z" };
    expect(careRequestSchema.safeParse({ ...base, end: base.start }).success).toBe(false);
    expect(careRequestSchema.safeParse({ ...base, period: "week" }).success).toBe(false);
  });

  it("assignability and replacement eligibility", () => {
    expect(caregiverAssignable(cgA, ["companionship"])).toBe(true);
    expect(caregiverAssignable(cgA, ["escort_to_appointment"])).toBe(false);
    expect(caregiverAssignable(cgC, ["companionship"])).toBe(false);
    expect(replacementAllowed(absent, cgB, "fx-care-agency-1", ["companionship"])).toBe(true);
    expect(replacementAllowed(absent, cgA, "fx-care-agency-1", ["companionship"])).toBe(false); // same caregiver
    expect(replacementAllowed(absent, cgB, null, ["companionship"])).toBe(false);
    expect(replacementAllowed(absent, { ...cgB, agencyId: "other" }, "fx-care-agency-1", ["companionship"])).toBe(false);
    expect(replacementAllowed({ ...absent, attendance: "scheduled" }, cgB, "fx-care-agency-1", ["companionship"])).toBe(false);
  });

  it("care denials and shift transitions", () => {
    const started = caretakerFixtures.assignments[1];
    expect(careActionDenial({ ...careActors.caregiverB, membershipStatus: "disabled" }, started, "end")).toBe("membership_inactive");
    expect(careActionDenial(careActors.caregiverB, started, "start", { now: NOW })).toBe("invalid_transition");
    expect(careActionDenial(careActors.agencyManager, started, "interrupt")).toBe("reason_required");
    expect(careActionDenial(careActors.agencyManager, started, "end")).toBe("not_assigned");
    expect(nextShiftAttendance("checked_out", "check_in")).toBeNull();
    expect(nextShiftAttendance("absent", "replace")).toBe("replaced");
  });

  it("status maps and the plans gate", () => {
    expect(describeCare("in_progress").known).toBe(false);
    expect(describeShift("replaced").tone).toBe("warning");
    expect(describeCredential("expired").tone).toBe("danger");
    expect(describeRatePeriod("year").known).toBe(false);
    expect(recurringPlansVM()).toEqual({ gated: true, reasonKey: "caretaker.plans.gated.scheduler_and_policy_not_approved" });
  });
});

describe("caretaker fixture adapter branches", () => {
  it("caregivers cannot list staff or requests; unknown assignment is not found", async () => {
    const cg = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => NOW });
    expect(code(await cg.listRequests())).toBe("forbidden");
    expect(code(await cg.getAssignment("nope"))).toBe("not_found");
    expect(code(await cg.listShifts({ assignmentId: "fx-care-asg-2" }))).toBe("not_found");
    const inactive = createCaretakerFixtureApi({ env: {}, actor: { ...careActors.caregiverA, membershipStatus: "invited" } });
    expect(code(await inactive.listServices())).toBe("forbidden");
    expect(code(await inactive.listAssignments())).toBe("forbidden");
  });

  it("care actions: too early, stale version, manager interrupt with reason", async () => {
    const early = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => new Date("2026-11-20T03:00:00Z") });
    expect(code(await early.performCareAction({ assignmentId: "fx-care-asg-1", action: "start", expectedVersion: 2, idempotencyKey: "e" }))).toBe("conflict");
    const cg = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => NOW });
    expect(code(await cg.performCareAction({ assignmentId: "fx-care-asg-1", action: "start", expectedVersion: 1, idempotencyKey: "v" }))).toBe("conflict");
    const mgr = createCaretakerFixtureApi({ env: {}, actor: careActors.agencyManager, now: () => NOW });
    expect(await mgr.performCareAction({ assignmentId: "fx-care-asg-2", action: "interrupt", expectedVersion: 3, idempotencyKey: "m0" })).toEqual({ ok: false, error: { code: "validation", fields: { reason: "required" } } });
    const done = data(await mgr.performCareAction({ assignmentId: "fx-care-asg-2", action: "interrupt", reason: "unsafe_conditions", expectedVersion: 3, idempotencyKey: "m1" }));
    expect(done).toMatchObject({ substate: "care_interrupted", interruption: { reason: "unsafe_conditions", recordedAt: NOW.toISOString() } });
  });

  it("shifts: check-out, manager absence, wrong-state check-in, replacement guards", async () => {
    const cgB = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverB, now: () => NOW });
    expect(data(await cgB.checkOut({ shiftId: "fx-shift-2", expectedVersion: 2, idempotencyKey: "o" }))).toMatchObject({ attendance: "checked_out", checkOutAt: NOW.toISOString() });
    const mgr = createCaretakerFixtureApi({ env: {}, actor: careActors.agencyManager, now: () => NOW });
    expect(data(await mgr.reportAbsence({ shiftId: "fx-shift-1", expectedVersion: 1, reason: "caregiver_unwell", idempotencyKey: "a" }))).toMatchObject({ attendance: "absent", absence: { reason: "caregiver_unwell" } });
    expect(code(await mgr.checkIn({ shiftId: "fx-shift-1", expectedVersion: 2, idempotencyKey: "c" }))).toBe("forbidden");
    const cgA = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => NOW });
    expect(code(await cgA.checkIn({ shiftId: "fx-shift-3", expectedVersion: 2, idempotencyKey: "w" }))).toBe("conflict");
    expect(code(await cgA.assignReplacement({ shiftId: "fx-shift-3", expectedVersion: 2, replacementResourceId: "fx-res-care-b", idempotencyKey: "r0" }))).toBe("forbidden");
    expect(code(await mgr.assignReplacement({ shiftId: "nope", expectedVersion: 1, replacementResourceId: "fx-res-care-b", idempotencyKey: "r1" }))).toBe("not_found");
    expect(code(await mgr.assignReplacement({ shiftId: "fx-shift-3", expectedVersion: 9, replacementResourceId: "fx-res-care-b", idempotencyKey: "r2" }))).toBe("conflict");
    expect(code(await mgr.assignReplacement({ shiftId: "fx-shift-3", expectedVersion: 2, replacementResourceId: "fx-res-care-a", idempotencyKey: "r3" }))).toBe("validation");
  });

  it("loaders: services, requests, assignment detail", async () => {
    const ctx = { workspace: listWorkspaces(W.agencyManager)[0], env: FX, now: () => NOW };
    const services = await loadCareServices(ctx);
    expect(services.status === "ok" && services.data[0].rates.map((r) => r.periodSupportedByBackend)).toEqual([true, true, false, false]);
    const requests = await loadCareRequests(ctx);
    expect(requests.status === "ok" && requests.data.rows[0]).toMatchObject({ reference: "#SCV-BKG-900401", canDecide: true, rate: { totalPaise: 120000 } });
    const detail = await loadAssignmentDetail(ctx, "fx-care-asg-1");
    expect(detail.status === "ok" && detail.data.shifts?.map((s) => s.id)).toEqual(["fx-shift-1", "fx-shift-3"]);
    expect(await loadAssignmentDetail(ctx, "fx-care-asg-3")).toEqual({ status: "not_found" });
  });
});

describe("admin rules and capability branches", () => {
  it("capability helpers", () => {
    expect(isAdminCapability(42)).toBe(false);
    expect(globalCapabilities(adminPrincipals.superAdmin, NOW)).toHaveLength(10);
    expect(globalCapabilities(adminPrincipals.orgAuditor, NOW)).toEqual([]);
  });

  it("review filters, coverage denials and bookability edges", async () => {
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier, now: () => NOW });
    const all = data(await api.listProviderReviews()).items;
    expect(filterProviderReviews(all, { category: "ambulance" }).map((r) => r.providerId)).toEqual(["fx-prov-amb-1"]);
    expect(filterProviderReviews(all, { expiringBefore: "2026-12-15T00:00:00Z" }).map((r) => r.providerId)).toEqual(["fx-prov-lab-2", "fx-prov-amb-1"]);
    expect(filterProviderReviews([{ ...all[0], earliestDocumentExpiry: null }], { expiringBefore: "2030-01-01T00:00:00Z" })).toEqual([]);
    expect(coverageDecisionDenial(adminPrincipals.contentEditor, { status: "proposed" }, "rejected", "x", undefined, NOW)).toBe("no_capability");
    expect(coverageDecisionDenial(adminPrincipals.verifier, { status: "proposed" }, "rejected", " ", undefined, NOW)).toBe("reason_required");
    expect(isBookableCoverage("approved", { status: "approved", validFrom: "2026-12-01T00:00:00Z", validTo: "2027-12-01T00:00:00Z" }, NOW)).toBe(false);
    expect(adminInviteSchema.safeParse({ email: "x@example.invalid", capabilities: ["support:operate", "support:operate"], scope: { kind: "global" } }).success).toBe(false);
    expect(adminInviteSchema.safeParse({ email: "x@example.invalid", capabilities: ["root"], scope: { kind: "global" } }).success).toBe(false);
  });

  it("access helpers: org-scoped routes, unauthenticated loader, array metrics", () => {
    expect(decideAdminAccess({ principal: adminPrincipals.orgAuditor, anyOf: ["security:audit"], locale: "en", path: "/en/admin/audit", now: NOW }).kind).toBe("denied");
    expect(decideAdminAccess({ principal: adminPrincipals.orgAuditor, anyOf: ["security:audit"], locale: "en", path: "/en/admin/audit", now: NOW, orgScopedOk: true }).kind).toBe("allowed");
    expect(decideAdminAccess({ principal: adminPrincipals.superAdmin, anyOf: [], locale: "en", path: "/en/admin", now: NOW }).kind).toBe("denied");
    expect(toLoaderResult({ ok: false, error: { code: "unauthenticated" } }, "http")).toEqual({ status: "unauthenticated" });
    expect(metricFrom({ ok: true, data: [1, 2, 3] })).toEqual({ kind: "value", value: 3, lowerBound: false });
    expect(metricFrom({ ok: false, error: { code: "forbidden" } })).toEqual({ kind: "unavailable", reason: "denied" });
  });
});

describe("admin fixture adapter branches", () => {
  const lead = () => createAdminFixtureApi({ env: {}, principal: adminPrincipals.superAdmin, now: () => NOW });

  it("provider review: not found, invalid transition, stale version, suspend approved", async () => {
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier, now: () => NOW });
    expect(code(await api.getProviderReview("nope"))).toBe("not_found");
    const base = { reason: "Checked.", idempotencyKey: "" };
    expect(code(await api.decideProviderReview({ ...base, providerId: "nope", decision: "approved", expectedVersion: 1, idempotencyKey: "a" }))).toBe("not_found");
    expect(code(await api.decideProviderReview({ ...base, providerId: "fx-prov-doc-1", decision: "approved", expectedVersion: 3, idempotencyKey: "b" }))).toBe("conflict");
    expect(code(await api.decideProviderReview({ ...base, providerId: "fx-prov-doc-1", decision: "under_review", expectedVersion: 2, idempotencyKey: "c" }))).toBe("conflict");
    expect(data(await api.decideProviderReview({ ...base, providerId: "fx-prov-amb-1", decision: "suspended", expectedVersion: 7, idempotencyKey: "d" }))).toEqual({ providerId: "fx-prov-amb-1", verificationState: "suspended", version: 8 });
    expect(data(await api.getProviderReview("fx-prov-amb-1")).history.at(-1)).toMatchObject({ decision: "suspended", reviewerProfileId: "fx-adm-verifier" });
  });

  it("coverage: revoke approved, reject proposed, invalid approve, filters", async () => {
    const api = createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier, now: () => NOW });
    expect(data(await api.listCoverage({ category: "lab" })).items.map((a) => a.areaId)).toEqual(["fx-area-3"]);
    expect(data(await api.listCoverage({ pin: "999902" })).items.map((a) => a.areaId)).toEqual(["fx-area-2"]);
    expect(data(await api.decideCoverage({ areaId: "fx-area-2", decision: "revoked", reason: "Base closed.", expectedVersion: 2, idempotencyKey: "r" })).status).toBe("revoked");
    expect(data(await api.decideCoverage({ areaId: "fx-area-1", decision: "rejected", reason: "No capacity.", expectedVersion: 1, idempotencyKey: "j" })).status).toBe("rejected");
    expect(code(await api.decideCoverage({ areaId: "fx-area-3", decision: "approved", reason: "x", validUntil: "2027-01-01T00:00:00Z", expectedVersion: 2, idempotencyKey: "i" }))).toBe("conflict");
    expect(code(await api.decideCoverage({ areaId: "nope", decision: "rejected", reason: "x", expectedVersion: 1, idempotencyKey: "n" }))).toBe("not_found");
    expect(code(await api.decideCoverage({ areaId: "fx-area-1", decision: "rejected", reason: "x", expectedVersion: 9, idempotencyKey: "s" }))).toBe("conflict");
  });

  it("booking ops, admins, invites, scope and suspension", async () => {
    const api = lead();
    expect(code(await api.findBookingByReference("#SCV-BKG-999999"))).toBe("not_found");
    expect(data(await api.listBookingExceptions()).items.map((b) => b.reference)).toEqual(["#SCV-BKG-900314"]);
    expect(data(await api.listAdmins())).toHaveLength(3);
    expect(data(await api.listAdminInvites())).toHaveLength(1);
    const invite = data(await api.inviteAdmin({ email: "new.admin@example.invalid", capabilities: ["support:operate"], scope: { kind: "global" }, idempotencyKey: "i1" }));
    expect(invite).toMatchObject({ maskedEmail: "n***@example.invalid", status: "pending", invitedByProfileId: "fx-adm-super" });
    expect(code(await api.inviteAdmin({ email: "not-an-email", capabilities: ["support:operate"], scope: { kind: "global" }, idempotencyKey: "i2" }))).toBe("validation");
    expect(code(await createAdminFixtureApi({ env: {}, principal: adminPrincipals.verifier }).inviteAdmin({ email: "a@example.invalid", capabilities: ["support:operate"], scope: { kind: "global" }, idempotencyKey: "i3" }))).toBe("forbidden");
    expect(data(await api.setAdminScope({ profileId: "fx-adm-verifier", capabilities: ["provider:verify"], scope: { kind: "global" }, idempotencyKey: "s1" })).grants).toHaveLength(1);
    expect(code(await api.setAdminScope({ profileId: "fx-adm-super", capabilities: ["provider:verify"], scope: { kind: "global" }, idempotencyKey: "s2" }))).toBe("forbidden");
    expect(code(await api.setAdminScope({ profileId: "nope", capabilities: ["provider:verify"], scope: { kind: "global" }, idempotencyKey: "s3" }))).toBe("not_found");
    expect(code(await api.suspendAdmin({ profileId: "fx-adm-verifier", reason: " ", idempotencyKey: "u1" }))).toBe("validation");
    expect(code(await api.suspendAdmin({ profileId: "fx-adm-suspended", reason: "Left.", idempotencyKey: "u2" }))).toBe("conflict");
    expect(data(await api.suspendAdmin({ profileId: "fx-adm-verifier", reason: "Left.", idempotencyKey: "u3" })).status).toBe("suspended");
    expect(data(await api.listSupportQueue()).items).toHaveLength(2);
  });

  it("admin loaders: users, exceptions, support, audit", async () => {
    const ctx = { principal: adminPrincipals.superAdmin, env: FX, now: () => NOW };
    const users = await loadAdminUsers(ctx);
    expect(users.status === "ok" && users.data.users.map((u) => [u.profileId, u.manageable])).toEqual([
      ["fx-adm-verifier", true],
      ["fx-adm-super", false],
      ["fx-adm-suspended", true],
    ]);
    const exc = await loadBookingExceptions(ctx);
    expect(exc.status === "ok" && exc.data[0].exceptions[0]).toEqual({ codeKey: "admin.bookingException.trip_interrupted", raisedAt: "2026-11-19T04:30:00Z", open: true });
    const support = await loadSupportQueue(ctx);
    expect(support.status === "ok" && support.data.map((s) => s.ownerKey)).toEqual(["admin.supportOwner.provider", "admin.supportOwner.platform"]);
    const audit = await loadAudit(ctx, { category: "content" });
    expect(audit.status === "ok" && audit.data.rows.map((r) => [r.id, r.category.labelKey])).toEqual([["fx-aud-4", "admin.audit.category.content"]]);
    expect(await loadAudit({ ...ctx, principal: adminPrincipals.verifier })).toEqual({ status: "denied" });
  });

  it("view models and statuses", () => {
    expect(toSupportRow({ id: "t", reference: "r", priority: "low", status: "open", owner: null, bookingReference: null, createdAt: "x", assignedAt: null, lastResponseAt: null }).ownerKey).toBe("admin.supportOwner.unassigned");
    expect(toAdminDashboard([{ key: "providerReviews", labelKey: "k", metric: { kind: "value", value: 0, lowerBound: false }, href: "/" }]).allClear).toBe(true);
    expect(toAdminDashboard([{ key: "providerReviews", labelKey: "k", metric: { kind: "unavailable", reason: "gated" }, href: "/" }]).allClear).toBe(false);
    expect(toAdminDashboard([]).allClear).toBe(false);
    for (const d of [describeAdminStatus("superuser"), describeInvite("sent"), describeRefund("paid"), describeSupport("pending"), describePriority("p1"), describeGate("true")]) {
      expect(d.known).toBe(false);
    }
  });
});

describe("admin http-util branches", () => {
  const schema = z.object({ ok: z.literal(true) });
  const client = (res: Response | Error) =>
    createHttpClient({ fetchImpl: async () => { if (res instanceof Error) throw res; return res; } });

  it("maps 429 with Retry-After, invalid JSON and schema mismatches", async () => {
    expect(await client(new Response("", { status: 429, headers: { "Retry-After": "12" } }))({ method: "GET", path: "/x", schema })).toEqual({ ok: false, error: { code: "rate_limited", retryAfterSeconds: 12 } });
    expect(await client(new Response("", { status: 429, headers: { "Retry-After": "soon" } }))({ method: "GET", path: "/x", schema })).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(await client(new Response("not json", { status: 200 }))({ method: "GET", path: "/x", schema })).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(await client(new Response(JSON.stringify({ ok: false }), { status: 200 }))({ method: "GET", path: "/x", schema })).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(await client(new Response(JSON.stringify({ ok: true }), { status: 200 }))({ method: "GET", path: "/x", schema })).toEqual({ ok: true, data: { ok: true } });
    expect(await client(new Response("", { status: 401 }))({ method: "GET", path: "/x", schema })).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("paiseFromServer accepts only safe non-negative integers", () => {
    expect(paiseFromServer("12345")).toBe(12345);
    expect(paiseFromServer(0)).toBe(0);
    for (const bad of ["-1", "1.5", "0012", "99999999999999999", "", 10.5, -3]) expect(paiseFromServer(bad)).toBeNull();
  });
});
