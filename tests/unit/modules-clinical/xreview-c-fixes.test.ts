import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import { draftReducer, initDraftState, MAX_AUTOSAVE_FAILURES, shouldAutosave, type DraftState } from "@/modules/clinical/draft-machine";
import { amendWithRecovery, finalizeWithRecovery, isOurAmendment } from "@/modules/clinical/finalize-flow";
import { emptyDraftContent, type AmendmentRequest, type ClinicalDraftContent } from "@/modules/clinical/schemas";
import type { Consultation, SignedConsultation } from "@/modules/clinical/types";
import { ok } from "@/lib/api/result";

// Synthetic data - not live. Regression tests for XREVIEW-c (fe2-c review of fe2-d clinical).
const T0 = new Date("2026-11-20T04:30:00.000Z");
const complete: ClinicalDraftContent = {
  vitals: {},
  assessment: { chiefComplaint: "Synthetic", assessmentType: "provisional" },
  prescription: { prescription: { mode: "none" } },
  care: { followUp: { mode: "not_required" } },
};
const withComplaint = (c: string): ClinicalDraftContent => ({ ...complete, assessment: { ...complete.assessment, chiefComplaint: c } });

function clinical() {
  const world = createClinicalWorld(T0);
  return createClinicalFixtureApi({ world, actor: { role: "doctor", doctorId: I.doctorAssigned }, now: () => T0 });
}
const lost = async () => ({ ok: false as const, error: { code: "unavailable" as const } });

describe("P1 amendment recovery binds the readback to this intent", () => {
  const input: AmendmentRequest = { baseVersion: 1, reason: "correction", reasonText: "Synthetic correction reason", content: withComplaint("mine"), acknowledged: true };

  it("identical base/reason/text but different content is a conflict, not signed", async () => {
    const api = clinical();
    await api.amend(I.consultationPastFinal, { ...input, content: withComplaint("someone else") }, "other-intent");
    const out = await amendWithRecovery({ amend: lost, getConsultation: api.getConsultation }, I.consultationPastFinal, input, "mine");
    expect(out).toEqual({ kind: "conflict" });
  });

  it("a matching historical amendment under a newer, different latest version is a conflict", async () => {
    const api = clinical();
    const amendThenLose = async (id: string, i: AmendmentRequest, k: string) => {
      await api.amend(id, i, k); // ours lands (v2)...
      await api.amend(id, { ...i, baseVersion: 2, reasonText: "Later unrelated synthetic amendment", content: withComplaint("later") }, "later"); // ...then v3
      return lost();
    };
    const out = await amendWithRecovery({ amend: amendThenLose, getConsultation: api.getConsultation }, I.consultationPastFinal, input, "mine");
    expect(out).toEqual({ kind: "conflict" });
  });

  it("current version with our base, reason and exact content is signed", async () => {
    const api = clinical();
    const amendThenLose = async (id: string, i: AmendmentRequest, k: string) => {
      await api.amend(id, i, k);
      return lost();
    };
    const out = await amendWithRecovery({ amend: amendThenLose, getConsultation: api.getConsultation }, I.consultationPastFinal, input, "mine");
    expect(out.kind).toBe("signed");
  });

  it("content comparison ignores key order but not values", () => {
    const record = {
      currentVersion: 2,
      versions: [{ version: 2, content: { care: complete.care, vitals: {}, prescription: complete.prescription, assessment: { assessmentType: "provisional", chiefComplaint: "mine" } } }],
      amendments: [{ version: 2, previousVersion: 1, reason: "correction", reasonText: input.reasonText }],
    } as unknown as SignedConsultation;
    expect(isOurAmendment(record, input)).toBe(true);
    expect(isOurAmendment(record, { ...input, content: withComplaint("mine!") })).toBe(false);
  });

  it("a readback for a different consultation id is never claimed as ours", async () => {
    const api = clinical();
    const other = await api.getConsultation(I.consultationPastFinal);
    if (!other.ok || other.data.status !== "final") throw new Error("fixture");
    const renamed: Consultation = { ...other.data, consultationId: "syn-c-other" };
    const out = await finalizeWithRecovery({ finalize: lost, getConsultation: async () => ok(renamed) }, I.consultationPastFinal, { expectedVersion: 1, acknowledged: true }, "k");
    expect(out).toEqual({ kind: "conflict" });
  });

  it("finalize recovery does not claim an already-amended record as this signing", async () => {
    const api = clinical();
    await api.amend(I.consultationPastFinal, input, "amend");
    const out = await finalizeWithRecovery({ finalize: lost, getConsultation: api.getConsultation }, I.consultationPastFinal, { expectedVersion: 1, acknowledged: true }, "k");
    expect(out).toEqual({ kind: "conflict" });
  });
});

describe("P2 reconnect never lifts a terminal autosave block", () => {
  const start = (): DraftState => initDraftState({ consultationId: "c1", content: emptyDraftContent(), version: 4, savedAt: T0.toISOString() });
  const dirty = (s: DraftState) => draftReducer(s, { type: "edit", content: withComplaint(`x${s.editSeq}`) });
  const fail = (s: DraftState, code: "forbidden" | "unauthenticated" | "validation" | "gated" | "unavailable") => {
    const sent = draftReducer(s, { type: "save_requested" });
    return draftReducer(sent, { type: "save_failed", requestId: sent.inFlight!.requestId, code });
  };

  for (const code of ["forbidden", "unauthenticated", "validation", "gated"] as const) {
    it(`${code} -> offline -> online (and duplicate online) does not resume autosave`, () => {
      let s = fail(dirty(start()), code);
      expect(shouldAutosave(s)).toBe(false);
      s = draftReducer(s, { type: "connectivity_changed", online: false });
      s = draftReducer(s, { type: "connectivity_changed", online: true });
      expect(shouldAutosave(s)).toBe(false);
      expect(s.status).toBe("failed");
      expect(draftReducer(s, { type: "connectivity_changed", online: true })).toBe(s);
      // Only the explicit retry action clears it.
      const retried = draftReducer(s, { type: "retry_requested" });
      expect(shouldAutosave(retried)).toBe(true);
      expect(retried.lastErrorCode).toBeNull();
    });
  }

  it("a redundant online event does not change state", () => {
    const s = fail(dirty(start()), "forbidden");
    expect(draftReducer(s, { type: "connectivity_changed", online: true })).toBe(s);
  });

  it("exhausted transient retries stay bounded across reconnects", () => {
    let s = dirty(start());
    for (let i = 0; i < MAX_AUTOSAVE_FAILURES; i++) s = fail(s, "unavailable");
    expect(shouldAutosave(s)).toBe(false);
    s = draftReducer(draftReducer(s, { type: "connectivity_changed", online: false }), { type: "connectivity_changed", online: true });
    expect(s.failures).toBe(MAX_AUTOSAVE_FAILURES);
    expect(shouldAutosave(s)).toBe(false);
  });

  it("a transient failure with budget left resumes after reconnect without refilling the budget", () => {
    let s = fail(dirty(start()), "unavailable");
    s = draftReducer(draftReducer(s, { type: "connectivity_changed", online: false }), { type: "connectivity_changed", online: true });
    expect(s.failures).toBe(1);
    expect(shouldAutosave(s)).toBe(true);
  });
});

describe("P2 conflict resolutions apply only to the reviewed edit sequence", () => {
  const server = { version: 6, savedAt: T0.toISOString(), content: withComplaint("theirs") };
  const inConflict = () => {
    let s = initDraftState({ consultationId: "c1", content: emptyDraftContent(), version: 4, savedAt: T0.toISOString() });
    s = draftReducer(s, { type: "edit", content: withComplaint("mine") });
    s = draftReducer(s, { type: "save_requested" });
    return draftReducer(s, { type: "save_failed", requestId: 1, code: "conflict", serverVersion: 6 });
  };

  it("stale keep_local keeps the conflict and starts no save", () => {
    const reviewed = inConflict();
    const edited = draftReducer(reviewed, { type: "edit", content: withComplaint("mine, newer") });
    const out = draftReducer(edited, { type: "conflict_resolved", resolution: "keep_local", server, reviewedEditSeq: reviewed.editSeq });
    expect(out).toBe(edited);
    expect(out.conflict).not.toBeNull();
    expect(shouldAutosave(out)).toBe(false);
  });

  it("a reviewed server snapshot older than the conflicting version is rejected", () => {
    const s = inConflict();
    const older = { ...server, version: 5 };
    expect(draftReducer(s, { type: "conflict_resolved", resolution: "keep_local", server: older, reviewedEditSeq: s.editSeq })).toBe(s);
    expect(draftReducer(s, { type: "conflict_resolved", resolution: "take_server", server: older, reviewedEditSeq: s.editSeq })).toBe(s);
  });

  it("current keep_local resolves and rebases on the reviewed server version", () => {
    const s = inConflict();
    const out = draftReducer(s, { type: "conflict_resolved", resolution: "keep_local", server, reviewedEditSeq: s.editSeq });
    expect(out).toMatchObject({ conflict: null, serverVersion: 6, status: "unsaved" });
    expect(shouldAutosave(out)).toBe(true);
  });
});
