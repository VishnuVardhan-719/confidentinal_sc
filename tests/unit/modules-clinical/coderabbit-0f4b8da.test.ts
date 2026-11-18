import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { amendmentSnapshot } from "@/components/clinical/amendment-snapshot";
import { bpReading } from "@/components/clinical/editor/bp";
import { editorLocked } from "@/components/clinical/editor/editor-lock";
import { numberTextFor } from "@/components/clinical/editor/fields";
import { createClinicalWorld, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import { amendWithRecovery } from "@/modules/clinical/finalize-flow";
import type { ClinicalDraftContent } from "@/modules/clinical/schemas";
import { msUntilProofExpiry } from "@/modules/records/logic";
import type { ProofOfVisit } from "@/modules/records/types";

// Synthetic data - not live. Regression tests for CodeRabbit findings on 0f4b8da.
const T0 = new Date("2026-11-20T04:30:00.000Z");

describe("(1) consultation editor is locked while signing is pending", () => {
  it("signing locks edits and saves even when otherwise writable", () => {
    expect(editorLocked({ writable: true, finalized: false, signing: false })).toBe(false);
    expect(editorLocked({ writable: true, finalized: false, signing: true })).toBe(true);
    expect(editorLocked({ writable: true, finalized: true, signing: false })).toBe(true);
    expect(editorLocked({ writable: false, finalized: false, signing: false })).toBe(true);
  });

  it("every step form edit goes through the locked edit wrapper", () => {
    const src = readFileSync("src/components/clinical/editor/consultation-editor.tsx", "utf8");
    expect(src).toContain("editorLocked({ writable, finalized: auto.draft.finalized, signing })");
    expect(src).not.toMatch(/onChange=\{\(v\) => auto\.edit\(/);
    expect((src.match(/onChange=\{\(v\) => edit\(updateStep\(/g) ?? []).length).toBe(4);
  });
});

describe("(2) amendment base version is captured with the edit snapshot", () => {
  const changed = (c: ClinicalDraftContent): ClinicalDraftContent => ({ ...c, assessment: { ...c.assessment, chiefComplaint: "Synthetic amended complaint" } });

  it("snapshot pairs the latest signed version with a copy of its content", async () => {
    const api = createClinicalFixtureApi({ world: createClinicalWorld(T0), actor: { role: "doctor", doctorId: I.doctorAssigned }, now: () => T0 });
    const r = await api.getConsultation(I.consultationPastFinal);
    if (!r.ok || r.data.status !== "final") throw new Error("fixture");
    const snap = amendmentSnapshot(r.data);
    expect(snap.baseVersion).toBe(r.data.currentVersion);
    snap.content.assessment.chiefComplaint = "mutated";
    expect(r.data.versions.at(-1)?.content.assessment.chiefComplaint).not.toBe("mutated");
  });

  it("a newer version landing after mount yields conflict, not a silent rebase", async () => {
    const api = createClinicalFixtureApi({ world: createClinicalWorld(T0), actor: { role: "doctor", doctorId: I.doctorAssigned }, now: () => T0 });
    const r = await api.getConsultation(I.consultationPastFinal);
    if (!r.ok || r.data.status !== "final") throw new Error("fixture");
    const snap = amendmentSnapshot(r.data); // taken when the form mounts
    const other = { baseVersion: snap.baseVersion, reason: "other" as const, reasonText: "Other synthetic amendment", content: changed(snap.content), acknowledged: true as const };
    await api.amend(I.consultationPastFinal, other, "other-intent"); // lands while this clinician edits
    const mine = { baseVersion: snap.baseVersion, reason: "correction" as const, reasonText: "Synthetic correction reason", content: changed(snap.content), acknowledged: true as const };
    const out = await amendWithRecovery(api, I.consultationPastFinal, mine, "mine");
    expect(out).toEqual({ kind: "conflict" });
  });
});

describe("(3) the correction form is not nested in the confirm form", () => {
  const src = readFileSync("src/components/clinical/health-facts-panel.tsx", "utf8");
  const split = src.indexOf("function CorrectFactForm");
  const panel = src.slice(0, split);
  const correct = src.slice(split);

  it("the confirm form opens after the correction form usage and closes before the panel ends", () => {
    const usage = panel.indexOf("<CorrectFactForm");
    const open = panel.indexOf("<form onSubmit={submit}");
    expect(usage).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(usage);
    expect((panel.match(/<form\b/g) ?? []).length).toBe(1);
    expect(panel.lastIndexOf("</form>")).toBeGreaterThan(open);
  });

  it("the correction form submits itself (Enter saves the correction, never Confirm)", () => {
    expect(correct).toMatch(/<form\b/);
    expect(correct).toContain("e.preventDefault()");
    expect(correct).toContain('type="submit"');
  });
});

describe("(4) numeric text follows external value changes", () => {
  const dec = /^\d{1,4}(\.\d{1,2})?$/;
  it("keeps typed text that already represents the value, replaces it otherwise", () => {
    expect(numberTextFor("37.0", 37, dec)).toBeNull();
    expect(numberTextFor("37.2", 38, dec)).toBe("38");
    expect(numberTextFor("37.2", undefined, dec)).toBe("");
    expect(numberTextFor("", undefined, dec)).toBeNull();
    expect(numberTextFor("abc", 36.5, dec)).toBe("36.5");
  });
});

describe("(6) blood pressure needs both values", () => {
  it("an incomplete entry is no reading", () => {
    expect(bpReading({ sys: 120, dia: 80 })).toEqual({ systolicMmHg: 120, diastolicMmHg: 80 });
    expect(bpReading({ sys: 120 })).toBeUndefined();
    expect(bpReading({})).toBeUndefined();
  });
});

describe("(7) proof badge re-evaluates at expiry", () => {
  const proof = (expiresAt: string, revokedAt: string | null = null) => ({ expiresAt, revokedAt }) as unknown as ProofOfVisit;
  it("schedules a re-check for active proofs only", () => {
    expect(msUntilProofExpiry(proof("2026-11-20T04:31:00.000Z"), T0)).toBe(60_000);
    expect(msUntilProofExpiry(proof("2026-11-20T04:29:00.000Z"), T0)).toBeNull();
    expect(msUntilProofExpiry(proof("2026-11-20T04:31:00.000Z", "2026-11-20T04:00:00.000Z"), T0)).toBeNull();
    expect(msUntilProofExpiry(proof("2027-11-20T04:30:00.000Z"), T0)).toBe(2_147_483_647);
  });
});
