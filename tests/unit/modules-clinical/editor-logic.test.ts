import { describe, expect, it } from "vitest";
import {
  acknowledgeAllergyReview,
  acknowledgeWarning,
  addMedicineLine,
  allergyBanner,
  buildReviewSummary,
  buildStepRail,
  changePrescriptionMode,
  CLINICAL_STEPS,
  missingMeta,
  moveMedicineLine,
  nextStep,
  prevStep,
  removeMedicineLine,
  setNotMeasured,
  setVital,
  stepStatus,
  updateMedicineLine,
  validateStep,
  vitalWarnings,
} from "@/modules/clinical/editor";
import { emptyDraftContent, type ClinicalDraftContent, type PrescriptionStep, type VitalWarningRule } from "@/modules/clinical/schemas";

const done = (): ClinicalDraftContent => ({
  vitals: { pulseBpm: 80 },
  assessment: { chiefComplaint: "Synthetic", assessmentType: "provisional" },
  prescription: { prescription: { mode: "none" } },
  care: { followUp: { mode: "not_required" } },
});

describe("step navigation and rail", () => {
  it("has the five steps in spec order with back/next", () => {
    expect(CLINICAL_STEPS).toEqual(["vitals", "assessment", "prescription", "care", "review"]);
    expect(nextStep("vitals")).toBe("assessment");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("vitals")).toBeNull();
    expect(prevStep("review")).toBe("care");
  });

  it("empty draft: steps not started and review blocked; complete draft: review ready", () => {
    const rail = buildStepRail(emptyDraftContent(), [], "vitals");
    expect(rail.map((r) => r.status)).toEqual(["not_started", "not_started", "not_started", "not_started", "blocked"]);
    expect(rail[0].current).toBe(true);
    expect(buildStepRail(done(), [], "review").map((r) => r.status)).toEqual(["complete", "complete", "complete", "complete", "ready"]);
  });

  it("partially filled assessment is in progress; unacknowledged vital warning needs attention", () => {
    expect(stepStatus("assessment", { ...done(), assessment: { chiefComplaint: "x" } }, [])).toBe("in_progress");
    const rule: VitalWarningRule = { id: "r1", metric: "pulseBpm", above: 70, severity: "danger", requiresAcknowledgment: true, labelKey: "k" };
    const content = done();
    expect(stepStatus("vitals", content, vitalWarnings(content, [rule]))).toBe("needs_attention");
    const acked = { ...content, vitals: acknowledgeWarning(content.vitals, "r1") };
    expect(stepStatus("vitals", acked, vitalWarnings(acked, [rule]))).toBe("complete");
    expect(acked.vitals.pulseBpm).toBe(80);
  });
});

describe("error summary metadata", () => {
  it("orders missing fields by step and gives a focus target", () => {
    const meta = missingMeta(["care.followUp", "assessment.chiefComplaint", "prescription.mode"]);
    expect(meta.map((m) => m.step)).toEqual(["assessment", "prescription", "care"]);
    expect(meta[0]).toMatchObject({ focusId: "assessment-chiefComplaint", labelKey: "clinical.missing.chiefComplaint" });
  });

  it("validateStep returns field-path codes", () => {
    expect(validateStep("vitals", { temperature: { value: 37 } })).toHaveProperty(["temperature.unit"]);
    expect(validateStep("vitals", { temperature: { value: 37, unit: "C" } })).toEqual({});
    expect(validateStep("care", { followUp: { mode: "recommended", date: "20-11-2026" } })).toHaveProperty(["followUp.date"]);
  });
});

describe("vitals helpers", () => {
  it("not measured clears the value explicitly; entering a value un-marks it", () => {
    let v = setNotMeasured({ pulseBpm: 90 }, "pulseBpm", true);
    expect(v).toMatchObject({ pulseBpm: null, notMeasured: ["pulseBpm"] });
    v = setVital(v, "pulseBpm", 91);
    expect(v).toMatchObject({ pulseBpm: 91, notMeasured: [] });
  });
});

describe("prescription helpers (DC08)", () => {
  const base: PrescriptionStep = { prescription: { mode: "medicines", items: [] } };

  it("add/update/move/remove keep order and stable keys", () => {
    let p = addMedicineLine(addMedicineLine(base, "a"), "b");
    p = updateMedicineLine(p, "b", { name: "Synthetic B", dose: "5 ml" });
    p = moveMedicineLine(p, "b", -1);
    expect(p.prescription.mode === "medicines" && p.prescription.items.map((i) => i.key)).toEqual(["b", "a"]);
    expect(moveMedicineLine(p, "b", -1)).toBe(p);
    p = removeMedicineLine(p, "a");
    expect(p.prescription.mode === "medicines" && p.prescription.items).toEqual([{ key: "b", name: "Synthetic B", dose: "5 ml" }]);
  });

  it("editing medicines resets the allergy acknowledgment", () => {
    let p = acknowledgeAllergyReview(addMedicineLine(base, "a"), ["fact-a-allergy:1"]);
    expect(p.allergyReview?.acknowledged).toBe(true);
    p = updateMedicineLine(p, "a", { name: "Changed" });
    expect(p.allergyReview?.acknowledged).toBe(false);
  });

  it("switching medicines -> none reports discarded lines for explicit confirmation", () => {
    const p = addMedicineLine(addMedicineLine(base, "a"), "b");
    const change = changePrescriptionMode(p, "none");
    expect(change.discardsItems).toBe(2);
    expect(change.content.prescription).toEqual({ mode: "none", note: undefined });
    expect(changePrescriptionMode({ prescription: { mode: "unset" } }, "medicines").discardsItems).toBe(0);
  });
});

describe("context header allergy banner", () => {
  it("never shows 'no allergies' when the server does not know", () => {
    expect(allergyBanner(null, null)).toEqual({ kind: "unknown" });
    expect(allergyBanner(true, null)).toEqual({ kind: "unknown" });
    expect(allergyBanner(false, null)).toEqual({ kind: "none_recorded" });
    expect(allergyBanner(true, [{ value: "Synthetic", verified: false }])).toEqual({ kind: "known", items: [{ value: "Synthetic", verified: false }] });
  });
});

describe("review summary", () => {
  it("passes values through unchanged and gates signing on missing fields", () => {
    const content = { ...done(), vitals: { temperature: { value: 100.4, unit: "F" as const } } };
    const s = buildReviewSummary(content, []);
    expect(s.canSign).toBe(true);
    expect(s.vitals.temperature).toEqual({ value: 100.4, unit: "F" });
    const blocked = buildReviewSummary(emptyDraftContent(), []);
    expect(blocked.canSign).toBe(false);
    expect(blocked.missing[0].step).toBe("assessment");
  });
});
