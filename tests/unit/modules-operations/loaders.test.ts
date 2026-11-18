import { describe, expect, it } from "vitest";
import { fail, ok } from "@/lib/api/result";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { metricFrom, toLoaderResult, type WorkspaceLoaderContext } from "@/modules/admin/access";
import { loadAdminDashboard, loadBookingByReference, loadPayments, loadSettings } from "@/modules/admin/loaders";
import { listWorkspaces, type WorkspaceMembership } from "@/modules/admin/workspace";
import { loadAmbulanceDashboard, loadDriverQueue, loadEmergencyPlaceholder, loadRequests, loadTrips } from "@/modules/ambulance/loaders";
import { loadAssignments, loadCareStaff, loadCaretakerDashboard, loadShifts } from "@/modules/caretaker/loaders";
import { getPublishedFaq, getPublishedStories, getPublishedStory } from "@/modules/content/public";
import { loadLabCollections, loadLabDashboard, loadLabOrderDetail, loadLabOrders, loadLabReports } from "@/modules/lab/loaders";

const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const NOW = () => new Date("2026-11-20T03:45:00Z");
const ctx = (memberships: WorkspaceMembership[], env: Record<string, string> = FX): WorkspaceLoaderContext => ({
  workspace: listWorkspaces(memberships)[0],
  env,
  now: NOW,
});
/** A workspace for a different provider of the same area, to prove nothing crosses over. */
const otherProvider = (memberships: WorkspaceMembership[]) => memberships.map((m) => ({ ...m, providerId: "fx-other-provider" }));

describe("loader result mapping", () => {
  it("maps API errors to page states and never turns an error into empty or zero", () => {
    expect(toLoaderResult(fail("forbidden"), "http")).toEqual({ status: "denied" });
    expect(toLoaderResult(fail("gated"), "http")).toEqual({ status: "gated" });
    expect(toLoaderResult(fail("not_found"), "http")).toEqual({ status: "not_found" });
    expect(toLoaderResult(fail("rate_limited", { retryAfterSeconds: 30 }), "http")).toEqual({ status: "error", code: "rate_limited", retryAfterSeconds: 30 });
    expect(toLoaderResult(ok([]), "fixture", (d) => d.length === 0)).toEqual({ status: "empty", fixture: true });
    expect(metricFrom(fail("unavailable"))).toEqual({ kind: "unavailable", reason: "error" });
    expect(metricFrom(ok({ items: [1, 2], nextCursor: "c" }))).toEqual({ kind: "value", value: 2, lowerBound: true });
  });

  it("http mode surfaces gated states instead of data", async () => {
    const res = await loadLabOrders(ctx(W.labManager, {}), "pending");
    expect(res).toEqual({ status: "gated" });
  });
});

describe("lab loaders", () => {
  it("manager dashboard shows real counts for the selected workspace only", async () => {
    const res = await loadLabDashboard(ctx(W.labManager));
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.fixture).toBe(true);
    expect(res.data.manager?.pending).toEqual({ kind: "value", value: 1, lowerBound: false });
    expect(res.data.manager?.exceptions).toEqual({ kind: "value", value: 1, lowerBound: false });
    expect(res.data.collector).toBeNull();
    expect(res.data.reviewer).toBeNull();
  });

  it("collector dashboard and queue hold only assigned jobs with allowed actions", async () => {
    const dash = await loadLabDashboard(ctx(W.labCollector));
    expect(dash.status === "ok" && dash.data.manager).toBeNull();
    const jobs = await loadLabCollections(ctx(W.labCollector));
    if (jobs.status !== "ok") throw new Error(jobs.status);
    expect(jobs.data.map((j) => j.reference)).toEqual(["#SCV-BKG-900102"]);
    expect(jobs.data[0].actions.map((a) => a.action)).toEqual(["start_collection", "record_collection_failed"]);
  });

  it("reviewer reports are gated without the clinical gate and show release only for reviewed", async () => {
    expect(await loadLabReports(ctx(W.labReviewer))).toEqual({ status: "gated" });
    const res = await loadLabReports(ctx(W.labReviewer, { ...FX, FEATURE_CLINICAL: "true" }));
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.data.map((r) => [r.status.labelKey, r.canReview, r.canRelease])).toEqual([
      ["lab.status.report.uploaded", true, false],
      ["lab.status.report.reviewed", false, true],
    ]);
    expect(await loadLabReports(ctx(W.labCollector, { ...FX, FEATURE_CLINICAL: "true" }))).toEqual({ status: "denied" });
  });

  it("a workspace for another provider never receives this provider's data", async () => {
    expect(await loadLabOrders(ctx(otherProvider(W.labManager)), "pending")).toEqual({ status: "denied" });
    expect(await loadLabOrderDetail(ctx(otherProvider(W.labManager)), "fx-lab-order-2")).toEqual({ status: "not_found" });
  });
});

describe("ambulance loaders", () => {
  it("operator dashboard and requests flag stale quotes and capacity", async () => {
    const dash = await loadAmbulanceDashboard(ctx(W.ambulanceOperator));
    if (dash.status !== "ok" || !dash.data.operator) throw new Error("no operator data");
    expect(dash.data.operator.pendingRequests).toEqual({ kind: "value", value: 2, lowerBound: false });
    expect(dash.data.operator.expiring?.map((e) => e.resourceId)).toContain("fx-veh-2");
    const req = await loadRequests(ctx(W.ambulanceOperator));
    if (req.status !== "ok") throw new Error(req.status);
    const [stale, fresh] = req.data.rows;
    expect(stale.acceptBlockers).toContain("quote_stale");
    expect(fresh.acceptBlockers).toEqual([]);
    expect(stale.canDecline).toBe(true);
  });

  it("driver loader returns only the assigned trip with a single next step and no ETA", async () => {
    const res = await loadDriverQueue(ctx(W.ambulanceDriver));
    if (res.status !== "ok") throw new Error(res.status);
    expect([res.data.current?.tripId, res.data.current?.nextAction, res.data.laterCount]).toEqual(["fx-trip-1", "en_route", 0]);
    expect(JSON.stringify(res.data)).not.toMatch(/eta|tracking|latitude|longitude/i);
    expect(await loadTrips(ctx(W.ambulanceDriver), "today")).toEqual({ status: "denied" });
  });

  it("emergency placeholder is unavailable regardless of adapter", () => {
    expect(loadEmergencyPlaceholder({ env: { FEATURE_EMERGENCY_DISPATCH: "true" } }).dispatchAvailable).toBe(false);
    expect(loadEmergencyPlaceholder().callNumber).toBe("112");
  });
});

describe("caretaker loaders", () => {
  it("agency manager sees agency data; caregiver sees own only; staff denied to caregiver", async () => {
    const dash = await loadCaretakerDashboard(ctx(W.agencyManager));
    if (dash.status !== "ok") throw new Error(dash.status);
    expect(dash.data.pendingRequests).toEqual({ kind: "value", value: 1, lowerBound: false });
    expect(dash.data.activeCare).toEqual({ kind: "value", value: 1, lowerBound: false });
    const own = await loadAssignments(ctx(W.caregiverA));
    if (own.status !== "ok") throw new Error(own.status);
    expect(own.data.map((a) => [a.reference, a.actions])).toEqual([["#SCV-BKG-900411", ["start", "interrupt"]]]);
    expect(await loadCareStaff(ctx(W.caregiverA))).toEqual({ status: "denied" });
  });

  it("shift view offers check-in only to the caregiver and replacement only to the manager", async () => {
    const cg = await loadShifts(ctx(W.caregiverA));
    if (cg.status !== "ok") throw new Error(cg.status);
    const rows = cg.data.flatMap((g) => g.shifts);
    expect(rows.find((s) => s.id === "fx-shift-1")?.actions).toEqual(["check_in", "absent"]);
    expect(rows.find((s) => s.id === "fx-shift-3")?.actions).toEqual([]);
    const mgr = await loadShifts(ctx(W.agencyManager));
    if (mgr.status !== "ok") throw new Error(mgr.status);
    expect(mgr.data.flatMap((g) => g.shifts).find((s) => s.id === "fx-shift-3")?.actions).toEqual(["replace"]);
  });
});

describe("admin loaders", () => {
  const actx = (principal: (typeof adminPrincipals)[keyof typeof adminPrincipals]) => ({ principal, env: FX, now: NOW });

  it("dashboard shows only queues the principal holds, with real counts", async () => {
    const verifier = await loadAdminDashboard(actx(adminPrincipals.verifier), "en");
    if (verifier.status !== "ok") throw new Error(verifier.status);
    expect(verifier.data.queues.map((q) => q.key)).toEqual(["providerReviews", "coverageProposals"]);
    expect(verifier.data.queues[0].metric).toEqual({ kind: "value", value: 1, lowerBound: false });
    expect(await loadAdminDashboard(actx(adminPrincipals.noGrants), "en")).toEqual({ status: "empty", fixture: true });
    const lead = await loadAdminDashboard(actx(adminPrincipals.superAdmin), "en");
    expect(lead.status === "ok" && lead.data.queues.map((q) => q.key)).toEqual([
      "providerReviews", "coverageProposals", "bookingExceptions", "supportEscalations", "refundRequests", "deniedAuditEvents",
    ]);
  });

  it("booking ops rejects free text before any call and keeps payment separate", async () => {
    expect(await loadBookingByReference(actx(adminPrincipals.superAdmin), "Fixture Patient")).toEqual({ status: "error", code: "validation", fields: { reference: "format" } });
    const res = await loadBookingByReference(actx(adminPrincipals.superAdmin), "scv-bkg-900104");
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.data.bookingState).toBe("completed");
    expect(res.data.payment.labelKey).toBe("admin.status.payment.due");
  });

  it("payments view never labels pay-after as gateway and keeps refund approval gated", async () => {
    const res = await loadPayments(actx(adminPrincipals.superAdmin));
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.data.payments.every((p) => !p.isGateway && p.gatewayReference === null)).toBe(true);
    expect(res.data.payments[1]).toMatchObject({ methodKey: "admin.paymentMethod.pay_after_cash", outstandingPaise: 66000 });
    expect(res.data.liveGatewayEnabled).toBe(false);
    expect(res.data.refundApproval).toBe("gated");
  });

  it("settings show gates read-only", async () => {
    const res = await loadSettings(actx(adminPrincipals.superAdmin));
    expect(res.status === "ok" && res.data.every((g) => g.editable === false && g.state.labelKey === "admin.settings.gateOff")).toBe(true);
  });
});

describe("public content helper", () => {
  it("serves published fixture content flagged as fixture", async () => {
    const stories = await getPublishedStories("en", FX);
    expect(stories.status === "ok" && stories.fixture).toBe(true);
    const faq = await getPublishedFaq("hi", FX);
    expect(faq.status === "ok" && faq.data[0].servedLocale).toBe("en");
  });

  it("maps the gated http adapter to empty (lists) and not_found (detail), never invented copy", async () => {
    expect(await getPublishedStories("en", {})).toEqual({ status: "empty", fixture: false });
    expect(await getPublishedFaq("te", {})).toEqual({ status: "empty", fixture: false });
    expect(await getPublishedStory("anything", "en", {})).toEqual({ status: "not_found" });
  });
});
