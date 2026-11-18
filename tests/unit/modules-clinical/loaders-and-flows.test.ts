import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import { amendWithRecovery, finalizeWithRecovery } from "@/modules/clinical/finalize-flow";
import { loadConsultationWorkspace, loadSignedRecord } from "@/modules/clinical/loaders";
import { emptyDraftContent, type AmendmentRequest, type ClinicalDraftContent } from "@/modules/clinical/schemas";
import type { SignedConsultation } from "@/modules/clinical/types";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { interpretCommand, loadDoctorDashboard, loadRequests, loadVisitDetail, requestRespondState } from "@/modules/doctor/loaders";
import { decideDoctorAccess, loginRedirect, parseRouteId, toPageState } from "@/modules/doctor/routing";
import { createRecordsFixtureApi } from "@/modules/records/fixture";

const T0 = new Date("2026-11-20T04:30:00.000Z");
const ON = { FEATURE_CLINICAL: "true" };
const complete: ClinicalDraftContent = {
  vitals: {},
  assessment: { chiefComplaint: "Synthetic", assessmentType: "provisional" },
  prescription: { prescription: { mode: "none" } },
  care: { followUp: { mode: "not_required" } },
};

function deps(doctorId: string = I.doctorAssigned) {
  const world = createClinicalWorld(T0);
  const actor = { role: "doctor" as const, doctorId };
  const now = () => T0;
  return {
    world,
    doctor: createDoctorFixtureApi({ world, actor, now }),
    clinical: createClinicalFixtureApi({ world, actor, now }),
    records: createRecordsFixtureApi({ world, actor, now }),
  };
}

describe("routing helpers", () => {
  it("rejects non-ID route params before any fetch", () => {
    expect(parseRouteId("../x")).toBeNull();
    expect(parseRouteId("a".repeat(65))).toBeNull();
    expect(parseRouteId(I.bookingToday)).toBe(I.bookingToday);
  });

  it("unauthenticated -> login with a safe next; wrong role -> denied; restricted limited to safe sections", () => {
    expect(decideDoctorAccess({ status: "unauthenticated" }, "te", "/te/doctor/visits/abc")).toEqual({ action: "redirect", to: "/te/login?next=%2Fte%2Fdoctor%2Fvisits%2Fabc" });
    expect(loginRedirect("en", "https://evil.example/doctor")).toBe("/en/login?next=%2Fen%2Fdoctor%2Fdashboard");
    expect(loginRedirect("en", "/en/doctor/visits?patient=Name")).toBe("/en/login?next=%2Fen%2Fdoctor%2Fdashboard");
    expect(decideDoctorAccess({ status: "forbidden" }, "en", "/en/doctor/dashboard")).toEqual({ action: "denied", reason: "forbidden" });
    expect(decideDoctorAccess({ status: "restricted" }, "en", "/en/doctor/support")).toEqual({ action: "render" });
    expect(decideDoctorAccess({ status: "restricted" }, "en", "/en/doctor/visits")).toEqual({ action: "denied", reason: "restricted" });
  });

  it("maps API errors to page states", () => {
    expect(toPageState({ ok: false, error: { code: "forbidden" } })).toEqual({ kind: "denied" });
    expect(toPageState({ ok: false, error: { code: "rate_limited", retryAfterSeconds: 5 } })).toEqual({ kind: "error", code: "rate_limited", retryable: true, retryAfterSeconds: 5 });
    expect(toPageState({ ok: true, data: [] as number[] }, (d) => d.length === 0)).toEqual({ kind: "empty" });
  });
});

describe("doctor loaders", () => {
  it("dashboard has requests, today, upcoming and the active consultation", async () => {
    const d = await loadDoctorDashboard(deps().doctor, T0);
    expect(d.requests.kind === "ready" && d.requests.data.map((r) => r.bookingId)).toEqual([I.bookingRequest]);
    expect(d.today.kind === "ready" && d.today.data.length).toBe(2);
    expect(d.upcoming.kind === "ready" && d.upcoming.data.length).toBe(1);
    expect(d.active?.bookingId).toBe(I.bookingActive);
  });

  it("another doctor gets empty sections, and denied visit detail", async () => {
    const other = deps(I.doctorOther).doctor;
    const d = await loadDoctorDashboard(other, T0);
    expect([d.requests.kind, d.today.kind, d.upcoming.kind]).toEqual(["empty", "empty", "empty"]);
    expect(await loadVisitDetail(other, I.bookingToday, T0)).toEqual({ kind: "denied" });
    expect(await loadVisitDetail(other, "../../etc", T0)).toEqual({ kind: "not_found" });
  });

  it("visit detail loads the challenge only after arrival", async () => {
    const { doctor } = deps();
    const before = await loadVisitDetail(doctor, I.bookingToday, T0);
    expect(before.kind === "ready" && before.data).toMatchObject({ actions: ["en_route"], challenge: null });
    const e = await doctor.enRoute(I.bookingToday, { expectedVersion: 3 });
    await doctor.arrive(I.bookingToday, { expectedVersion: e.ok ? e.data.version : 0 });
    const after = await loadVisitDetail(doctor, I.bookingToday, T0);
    expect(after.kind === "ready" && after.data.actions).toEqual(["verify_arrival"]);
    expect(after.kind === "ready" && after.data.challenge?.kind === "ready" && after.data.challenge.data.view.phase).toBe("enter_code");
  });

  it("decline needs a doctor reason; concurrent accept/decline surfaces refresh", async () => {
    const { doctor } = deps();
    expect(await doctor.decline(I.bookingRequest, { expectedVersion: 2, reason: "patient_request" })).toEqual({ ok: false, error: { code: "validation" } });
    const accepted = await doctor.accept(I.bookingRequest, { expectedVersion: 2, resourceIds: [I.resourceDoctor] });
    expect(interpretCommand(accepted, "accept")).toEqual({ kind: "done", version: 3 });
    const late = await doctor.decline(I.bookingRequest, { expectedVersion: 2, reason: "provider_unavailable" });
    expect(interpretCommand(late, "decline")).toEqual({ kind: "refresh", messageKey: "doctor.command.decline.conflict" });
    expect((await loadRequests(doctor)).kind).toBe("empty");
  });

  it("request respond window comes from the server timestamp", () => {
    expect(requestRespondState({ state: "requested", respondBy: "2026-11-20T04:31:00.000Z" }, T0)).toEqual({ open: true, secondsLeft: 60 });
    expect(requestRespondState({ state: "requested", respondBy: "2026-11-20T04:29:00.000Z" }, T0)).toEqual({ open: false, secondsLeft: 0 });
    expect(requestRespondState({ state: "requested", respondBy: null }, T0)).toEqual({ open: true, secondsLeft: null });
    expect(requestRespondState({ state: "accepted", respondBy: null }, T0)).toEqual({ open: false, secondsLeft: null });
  });

  it("accept resources: own resource only", async () => {
    expect(await deps().doctor.listAcceptResources()).toEqual({ ok: true, data: [{ resourceId: I.resourceDoctor, displayName: "Dr. Fixture Asha (synthetic)" }] });
    expect(await deps(I.doctorOther).doctor.listAcceptResources()).toEqual({ ok: true, data: [] });
  });
});

describe("consultation workspace loader", () => {
  it("is gated before any data is read when the clinical flag is off", async () => {
    const d = deps();
    let reads = 0;
    const spy = { ...d.doctor, getVisit: async (id: string) => (reads++, d.doctor.getVisit(id)) };
    expect(await loadConsultationWorkspace({ ...d, doctor: spy, env: {} }, I.bookingActive)).toEqual({ kind: "gated" });
    expect(reads).toBe(0);
  });

  it("other doctor denied; visit without consultation is not_started", async () => {
    expect(await loadConsultationWorkspace({ ...deps(I.doctorOther), env: ON }, I.bookingActive)).toEqual({ kind: "denied" });
    const r = await loadConsultationWorkspace({ ...deps(), env: ON }, I.bookingToday);
    expect(r.kind === "ready" && r.data.mode).toBe("not_started");
  });

  it("editor mode carries the draft, allergy banner and writability", async () => {
    const r = await loadConsultationWorkspace({ ...deps(), env: ON }, I.bookingActive);
    if (r.kind !== "ready" || r.data.mode !== "editor") throw new Error(r.kind);
    expect(r.data.writable).toBe(true);
    expect(r.data.draft.version).toBe(1);
    expect(r.data.allergies).toEqual({ kind: "known", items: [{ value: "Synthetic allergy entry", verified: false }] });
  });

  it("signed record route never renders a draft", async () => {
    const d = deps();
    expect(await loadSignedRecord({ clinical: d.clinical, env: ON }, I.consultationActive)).toEqual({ kind: "not_found" });
    expect((await loadSignedRecord({ clinical: d.clinical, env: ON }, I.consultationPastFinal)).kind).toBe("ready");
    expect(await loadSignedRecord({ clinical: d.clinical, env: {} }, I.consultationPastFinal)).toEqual({ kind: "gated" });
  });
});

describe("finalize / amend with uncertain-outcome recovery (DC07)", () => {
  it("lost response after a successful sign is recovered by refetch, not re-signed", async () => {
    const d = deps();
    await d.clinical.saveDraft(I.consultationActive, { expectedVersion: 1, content: complete });
    let calls = 0;
    const lossy = async (id: string, input: { expectedVersion: number; acknowledged: true }, key: string) => {
      calls++;
      await d.clinical.finalize(id, input, key); // server signs...
      return { ok: false as const, error: { code: "unavailable" as const } }; // ...but the response is lost
    };
    const out = await finalizeWithRecovery({ finalize: lossy, getConsultation: d.clinical.getConsultation }, I.consultationActive, { expectedVersion: 2, acknowledged: true }, "intent-1");
    expect(out.kind).toBe("signed");
    expect(calls).toBe(1);
  });

  it("lost response before signing is uncertain (retry with the same key)", async () => {
    const d = deps();
    const out = await finalizeWithRecovery(
      { finalize: async () => ({ ok: false, error: { code: "unavailable" } }), getConsultation: d.clinical.getConsultation },
      I.consultationActive,
      { expectedVersion: 1, acknowledged: true },
      "k",
    );
    expect(out).toEqual({ kind: "uncertain" });
    const thrown = await finalizeWithRecovery({ finalize: async () => { throw new Error("net"); }, getConsultation: async () => { throw new Error("net"); } }, "x", { expectedVersion: 1, acknowledged: true }, "k");
    expect(thrown).toEqual({ kind: "uncertain" });
  });

  it("validation and conflict map to reviewable outcomes", async () => {
    const d = deps();
    const v = await finalizeWithRecovery(d.clinical, I.consultationActive, { expectedVersion: 1, acknowledged: true }, "k1");
    expect(v.kind).toBe("invalid");
    const c = await finalizeWithRecovery(d.clinical, I.consultationPastFinal, { expectedVersion: 4, acknowledged: true }, "k2");
    expect(c).toEqual({ kind: "conflict" });
  });

  it("amend recovery only claims success for a matching amendment", async () => {
    const d = deps();
    const input = { baseVersion: 1, reason: "correction" as const, reasonText: "Synthetic correction reason", content: complete, acknowledged: true as const };
    const someoneElse = { ...input, reasonText: "A different synthetic amendment" };
    await d.clinical.amend(I.consultationPastFinal, someoneElse, "other");
    const lost = async () => ({ ok: false as const, error: { code: "unavailable" as const } });
    const out = await amendWithRecovery({ amend: lost, getConsultation: d.clinical.getConsultation }, I.consultationPastFinal, input, "mine");
    expect(out).toEqual({ kind: "conflict" });
    const mineAfter = async (id: string, i: AmendmentRequest, k: string) => {
      await d.clinical.amend(id, { ...i, baseVersion: 2 }, k);
      return { ok: false as const, error: { code: "unavailable" as const } };
    };
    const ok = await amendWithRecovery({ amend: mineAfter, getConsultation: d.clinical.getConsultation }, I.consultationPastFinal, { ...input, baseVersion: 2 }, "mine2");
    expect(ok.kind === "signed" && (ok.record as SignedConsultation).currentVersion).toBe(3);
  });

  it("empty draft is not finalizable through the flow either", async () => {
    const d = deps();
    await d.clinical.saveDraft(I.consultationActive, { expectedVersion: 1, content: emptyDraftContent() });
    expect((await finalizeWithRecovery(d.clinical, I.consultationActive, { expectedVersion: 2, acknowledged: true }, "k")).kind).toBe("invalid");
  });
});
