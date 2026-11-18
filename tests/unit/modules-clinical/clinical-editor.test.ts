import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import {
  amendmentRequestSchema,
  assessmentStepSchema,
  emptyDraftContent,
  evaluateVitalWarnings,
  missingForFinalize,
  prescriptionStepSchema,
  vitalsStepSchema,
  type ClinicalDraftContent,
  type VitalWarningRule,
} from "@/modules/clinical/schemas";
import { canFinalize, draftReducer, initDraftState, shouldAutosave, type DraftState } from "@/modules/clinical/draft-machine";

const T0 = new Date("2026-11-20T04:30:00.000Z");

const complete = (): ClinicalDraftContent => ({
  vitals: {},
  assessment: { chiefComplaint: "Synthetic complaint", assessmentType: "provisional" },
  prescription: { prescription: { mode: "none" } },
  care: { followUp: { mode: "not_required" } },
});

describe("DC04 vitals and examination", () => {
  it("requires an explicit temperature unit and preserves entered values exactly", () => {
    expect(vitalsStepSchema.safeParse({ temperature: { value: 101.3 } }).success).toBe(false);
    const parsed = vitalsStepSchema.parse({ temperature: { value: 101.3, unit: "F" }, bloodPressure: { systolicMmHg: 182, diastolicMmHg: 121 }, spo2Percent: 88.5 });
    expect(parsed.temperature).toEqual({ value: 101.3, unit: "F" });
    expect(parsed.bloodPressure).toEqual({ systolicMmHg: 182, diastolicMmHg: 121 });
    expect(parsed.spo2Percent).toBe(88.5);
  });

  it("rejects structurally impossible values instead of silently correcting them", () => {
    expect(vitalsStepSchema.safeParse({ spo2Percent: 101 }).success).toBe(false);
    expect(vitalsStepSchema.safeParse({ pulseBpm: -3 }).success).toBe(false);
    expect(vitalsStepSchema.safeParse({ pulseBpm: 72.5 }).success).toBe(false);
  });

  it("warnings come only from injected approved rules, never alter values and need acknowledgment", () => {
    const vitals = { temperature: { value: 104, unit: "F" as const } };
    expect(evaluateVitalWarnings(vitals, [])).toEqual([]);
    const rule: VitalWarningRule = { id: "r-temp-f", metric: "temperatureF", above: 103, severity: "danger", requiresAcknowledgment: true, labelKey: "clinical.vitals.warn.temp" };
    const w = evaluateVitalWarnings(vitals, [rule]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ value: 104, acknowledged: false });
    expect(vitals.temperature.value).toBe(104);
    expect(missingForFinalize(complete(), w)).toContain("vitals.warningAcknowledgment");
    const acked = evaluateVitalWarnings({ ...vitals, acknowledgedWarnings: ["r-temp-f"] }, [rule]);
    expect(missingForFinalize(complete(), acked)).toEqual([]);
  });
});

describe("DC05 draft autosave state machine", () => {
  const start = (): DraftState => initDraftState({ consultationId: "c1", content: emptyDraftContent(), version: 4, savedAt: T0.toISOString() });
  const edit = (s: DraftState, complaint: string) =>
    draftReducer(s, { type: "edit", content: { ...s.content, assessment: { ...s.content.assessment, chiefComplaint: complaint } } });

  it("edit -> unsaved -> saving (with current version) -> saved", () => {
    let s = edit(start(), "a");
    expect(s.status).toBe("unsaved");
    expect(shouldAutosave(s)).toBe(true);
    s = draftReducer(s, { type: "save_requested" });
    expect(s.status).toBe("saving");
    expect(s.inFlight).toEqual({ requestId: 1, baseVersion: 4, editSeq: 1, content: s.content });
    s = draftReducer(s, { type: "save_succeeded", requestId: 1, version: 5, savedAt: T0.toISOString() });
    expect(s).toMatchObject({ status: "saved", serverVersion: 5, inFlight: null });
    expect(canFinalize(s)).toBe(true);
  });

  it("stale responses are ignored", () => {
    let s = draftReducer(edit(start(), "a"), { type: "save_requested" });
    const ignored = draftReducer(s, { type: "save_succeeded", requestId: 99, version: 9, savedAt: T0.toISOString() });
    expect(ignored).toBe(s);
    s = draftReducer(s, { type: "save_succeeded", requestId: 1, version: 5, savedAt: T0.toISOString() });
    // A late duplicate of an older version cannot roll the version back.
    expect(draftReducer(s, { type: "save_succeeded", requestId: 1, version: 5, savedAt: T0.toISOString() })).toBe(s);
  });

  it("edits during an in-flight save stay unsaved after the response", () => {
    let s = draftReducer(edit(start(), "a"), { type: "save_requested" });
    s = edit(s, "ab");
    expect(draftReducer(s, { type: "save_requested" })).toBe(s); // serialized, no second write
    s = draftReducer(s, { type: "save_succeeded", requestId: 1, version: 5, savedAt: T0.toISOString() });
    expect(s.status).toBe("unsaved");
    expect(canFinalize(s)).toBe(false);
  });

  it("conflict stops autosave until the clinician reconciles", () => {
    let s = draftReducer(edit(start(), "mine"), { type: "save_requested" });
    s = draftReducer(s, { type: "save_failed", requestId: 1, code: "conflict", serverVersion: 6 });
    expect(s.status).toBe("conflict");
    expect(shouldAutosave(s)).toBe(false);
    expect(draftReducer(s, { type: "save_requested" })).toBe(s);
    s = edit(s, "mine 2");
    expect(s.status).toBe("conflict");
    expect(canFinalize(s)).toBe(false);
    const server = { version: 6, savedAt: T0.toISOString(), content: { ...emptyDraftContent(), assessment: { chiefComplaint: "theirs" } } };
    const kept = draftReducer(s, { type: "conflict_resolved", resolution: "keep_local", server, reviewedEditSeq: s.editSeq });
    expect(kept).toMatchObject({ status: "unsaved", serverVersion: 6, conflict: null });
    expect(kept.content.assessment.chiefComplaint).toBe("mine 2");
    // take_server against an older review is ignored: the newer local edit was never reviewed.
    expect(draftReducer(s, { type: "conflict_resolved", resolution: "take_server", server, reviewedEditSeq: s.editSeq - 1 })).toBe(s);
    const taken = draftReducer(s, { type: "conflict_resolved", resolution: "take_server", server, reviewedEditSeq: s.editSeq });
    expect(taken).toMatchObject({ status: "saved", serverVersion: 6 });
    expect(taken.content.assessment.chiefComplaint).toBe("theirs");
  });

  it("offline pauses autosave; failures retry boundedly; finalize disabled unless clean+saved", () => {
    let s = draftReducer(edit(start(), "a"), { type: "connectivity_changed", online: false });
    expect(s.status).toBe("offline");
    expect(shouldAutosave(s)).toBe(false);
    expect(draftReducer(s, { type: "save_requested" })).toBe(s);
    s = draftReducer(s, { type: "connectivity_changed", online: true });
    expect(s.status).toBe("unsaved");
    for (let i = 0; i < 3; i++) {
      s = draftReducer(s, { type: "save_requested" });
      s = draftReducer(s, { type: "save_failed", requestId: s.inFlight!.requestId, code: "unavailable" });
    }
    expect(s.status).toBe("failed");
    expect(s.autosaveEnabled).toBe(false);
    expect(canFinalize(s)).toBe(false);
    const forbidden = draftReducer(draftReducer(edit(start(), "x"), { type: "save_requested" }), { type: "save_failed", requestId: 1, code: "forbidden" });
    expect(forbidden.autosaveEnabled).toBe(false);
  });

  it("module code never uses browser persistent storage for drafts", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const files = ["src/modules/clinical", "src/modules/records", "src/modules/doctor", "src/fixtures/clinical"].flatMap(walk);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});

describe("DC06 clinician-authored assessment", () => {
  it("provisional assessment with uncertainty is complete without a definitive diagnosis", () => {
    const a = assessmentStepSchema.parse({ chiefComplaint: "Synthetic", assessmentType: "provisional", uncertaintyNote: "Unclear; review" });
    expect(missingForFinalize({ ...complete(), assessment: a })).toEqual([]);
  });

  it("a final assessment needs clinician text; missing type blocks finalization", () => {
    expect(missingForFinalize({ ...complete(), assessment: { chiefComplaint: "x", assessmentType: "final" } })).toContain("assessment.assessmentText");
    expect(missingForFinalize({ ...complete(), assessment: { chiefComplaint: "x" } })).toContain("assessment.assessmentType");
  });
});

describe("DC08 structured prescription", () => {
  it("explicit no-medicine is valid and needs no allergy acknowledgment", () => {
    expect(prescriptionStepSchema.safeParse({ prescription: { mode: "none" } }).success).toBe(true);
    expect(missingForFinalize(complete())).toEqual([]);
  });

  it("unset prescription choice blocks finalization", () => {
    expect(missingForFinalize({ ...complete(), prescription: { prescription: { mode: "unset" } } })).toContain("prescription.mode");
  });

  it("medicine lines require allergy review acknowledgment and a name", () => {
    const meds = { prescription: { mode: "medicines" as const, items: [{ key: "m1", name: "Synthetic medicine", dose: "1 unit" }, { key: "m2", name: " " }] } };
    expect(prescriptionStepSchema.safeParse(meds).success).toBe(true);
    const missing = missingForFinalize({ ...complete(), prescription: meds });
    expect(missing).toEqual(expect.arrayContaining(["prescription.allergyReview", "prescription.itemName"]));
    const ok = missingForFinalize({ ...complete(), prescription: { prescription: { mode: "medicines", items: [meds.prescription.items[0]] }, allergyReview: { acknowledged: true } } });
    expect(ok).toEqual([]);
  });

  it("rejects unknown fields (no AI/auto-generated extras)", () => {
    expect(prescriptionStepSchema.safeParse({ prescription: { mode: "medicines", items: [{ key: "m1", name: "x", aiSuggested: true }] } }).success).toBe(false);
  });
});

describe("DC07 review, sign, immutable record and amendment", () => {
  const setup = (doctorId: string = I.doctorAssigned) => {
    const world = createClinicalWorld(T0);
    return { world, api: createClinicalFixtureApi({ world, actor: { role: "doctor", doctorId }, now: () => T0 }) };
  };

  it("unassigned doctor cannot read or write the consultation", async () => {
    const { api } = setup(I.doctorOther);
    expect(await api.getDraft(I.consultationActive)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await api.saveDraft(I.consultationActive, { expectedVersion: 1, content: complete() })).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("stale draft save is a conflict", async () => {
    const { api } = setup();
    expect(await api.saveDraft(I.consultationActive, { expectedVersion: 0, content: complete() })).toEqual({ ok: false, error: { code: "conflict" } });
  });

  it("finalize is blocked on missing fields, signs once, then the record is immutable", async () => {
    const { api } = setup();
    const missing = await api.finalize(I.consultationActive, { expectedVersion: 1, acknowledged: true }, "k1");
    expect(!missing.ok && missing.error.code).toBe("validation");
    const saved = await api.saveDraft(I.consultationActive, { expectedVersion: 1, content: complete() });
    expect(saved).toEqual({ ok: true, data: { version: 2, savedAt: T0.toISOString() } });
    const signed = await api.finalize(I.consultationActive, { expectedVersion: 2, acknowledged: true }, "k2");
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(signed.data.versions[0].signedBy.clinicianId).toBe(I.doctorAssigned);
    expect(Object.isFrozen(signed.data.versions[0].content)).toBe(true);
    // Same intent retried: idempotent. New intent: denied. Draft writes: denied.
    const retry = await api.finalize(I.consultationActive, { expectedVersion: 2, acknowledged: true }, "k2");
    expect(retry.ok && retry.data.currentVersion).toBe(1);
    expect(await api.finalize(I.consultationActive, { expectedVersion: 2, acknowledged: true }, "k3")).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await api.saveDraft(I.consultationActive, { expectedVersion: 2, content: emptyDraftContent() })).toEqual({ ok: false, error: { code: "conflict" } });
  });

  it("amendment requires a reason and appends a version without changing the original", async () => {
    const { api } = setup();
    const before = await api.getConsultation(I.consultationPastFinal);
    if (!before.ok || before.data.status !== "final") throw new Error("fixture");
    const original = JSON.stringify(before.data.versions[0]);
    expect(amendmentRequestSchema.safeParse({ baseVersion: 1, reason: "correction", reasonText: "", content: complete(), acknowledged: true }).success).toBe(false);
    expect(await api.amend(I.consultationPastFinal, { baseVersion: 2, reason: "correction", reasonText: "Synthetic correction reason", content: complete(), acknowledged: true }, "a0")).toEqual({ ok: false, error: { code: "conflict" } });
    const amended = await api.amend(I.consultationPastFinal, { baseVersion: 1, reason: "correction", reasonText: "Synthetic correction reason", content: complete(), acknowledged: true }, "a1");
    expect(amended.ok).toBe(true);
    if (!amended.ok) return;
    expect(amended.data.currentVersion).toBe(2);
    expect(amended.data.versions).toHaveLength(2);
    expect(JSON.stringify(amended.data.versions[0])).toBe(original);
    expect(amended.data.amendments[0]).toMatchObject({ version: 2, previousVersion: 1, reason: "correction" });
  });
});
