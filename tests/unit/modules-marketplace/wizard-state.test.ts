import { describe, expect, it } from "vitest";
import { createWizardState, wizardReducer, WIZARD_STEPS, type WizardState } from "@/modules/bookings/wizard-state";
import { kolkataScheduleToUtc } from "@/modules/bookings/schedule";
import { reviewedFixture, bookingFromReview } from "./phase2-fixtures";

function readyWizard(): WizardState {
  let state = createWizardState(); const review = reviewedFixture();
  for (const step of WIZARD_STEPS.slice(0, 6)) {
    if (step === "review" || step === "result") throw new Error("Unexpected step");
    state = wizardReducer(state, { type: "save", step, value: review[step] });
    state = wizardReducer(state, { type: "next" });
  }
  return wizardReducer(state, { type: "save", step: "review", value: review });
}
describe("eight-step booking state machine", () => {
  it("requires valid prior steps and never navigates directly to a receipt", () => {
    const initial = createWizardState();
    expect(wizardReducer(initial, { type: "next" }).step).toBe("service");
    expect(wizardReducer(initial, { type: "go", step: "review" }).step).toBe("service");
    const ready = readyWizard(); expect(ready.step).toBe("review");
    expect(wizardReducer(ready, { type: "next" }).step).toBe("review");
    expect(wizardReducer(ready, { type: "go", step: "result" }).step).toBe("review");
  });
  it("preserves draft on back navigation and invalidates downstream values only after a material change", () => {
    const ready = readyWizard();
    const back = wizardReducer(ready, { type: "go", step: "patient" });
    expect(back.values.review).toEqual(ready.values.review);
    const same = wizardReducer(back, { type: "save", step: "patient", value: reviewedFixture().patient });
    expect(same.values.review).toEqual(ready.values.review);
    const changed = wizardReducer(back, { type: "save", step: "patient", value: { ...reviewedFixture().patient, patientId: "00000000-0000-4000-8000-000000000002" } });
    expect(changed.values.location).toBeUndefined(); expect(changed.values.review).toBeUndefined();
    expect(changed.values.service).toEqual(ready.values.service);
  });
  it("refuses a review that differs from the saved steps", () => {
    const ready = readyWizard(); const changed = reviewedFixture(); changed.location.pin = "500002";
    expect(wizardReducer(ready, { type: "save", step: "review", value: changed }).issues).toEqual([{ path: "review", code: "review_changed" }]);
  });
  it("locks edits after uncertain submission and accepts only the matching response revision", () => {
    const ready = readyWizard(); const submitting = wizardReducer(ready, { type: "submit_started" });
    expect(submitting.phase).toBe("submitting");
    const uncertain = wizardReducer(submitting, { type: "submit_uncertain", revision: submitting.revision });
    expect(uncertain.phase).toBe("uncertain");
    expect(wizardReducer(uncertain, { type: "go", step: "service" })).toEqual(uncertain);
    const stale = wizardReducer(uncertain, { type: "submit_resolved", revision: uncertain.revision - 1, booking: bookingFromReview(reviewedFixture()) });
    expect(stale).toEqual(uncertain);
    const resolved = wizardReducer(uncertain, { type: "submit_resolved", revision: uncertain.revision, booking: bookingFromReview(reviewedFixture()) });
    expect(resolved.step).toBe("result"); expect(resolved.phase).toBe("result");
    expect(resolved.values.result?.publicReference).toBe(null);
  });
  it("keeps a mismatched offer locked instead of showing a success receipt", () => {
    const ready = wizardReducer(readyWizard(), { type: "submit_started" });
    const changed = bookingFromReview(reviewedFixture()); changed.priceSnapshot.amountPaise++;
    const resolved = wizardReducer(ready, { type: "submit_resolved", revision: ready.revision, booking: changed });
    expect(resolved.phase).toBe("review_required");
    expect(resolved.values.result?.id).toBe(changed.id);
    expect(wizardReducer(resolved, { type: "go", step: "service" })).toBe(resolved);
  });
  it("cannot unlock an uncertain outcome with a later rejection", () => {
    const ready = wizardReducer(readyWizard(), { type: "submit_started" });
    const uncertain = wizardReducer(ready, { type: "submit_uncertain", revision: ready.revision });
    expect(wizardReducer(uncertain, { type: "submit_rejected", revision: ready.revision, code: "forbidden" })).toBe(uncertain);
  });
  it("returns stable field codes without retaining invalid free text", () => {
    const state = wizardReducer(createWizardState(), { type: "save", step: "service", value: { secret: "sensitive transient test input" } });
    expect(state.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(state)).not.toContain("sensitive transient");
  });
  it("converts IST wall time explicitly to UTC and validates future schedule/date", () => {
    expect(kolkataScheduleToUtc({ date: "2026-11-20", time: "10:00", durationMinutes: 60 }, "2026-11-18T00:00:00Z")).toEqual({ ok: true, data: { startAt: "2026-11-20T04:30:00.000Z", endAt: "2026-11-20T05:30:00.000Z" } });
    for (const input of [{ date: "2026-02-30", time: "10:00", durationMinutes: 60 }, { date: "2026-11-17", time: "10:00", durationMinutes: 60 }])
      expect(kolkataScheduleToUtc(input, "2026-11-18T00:00:00Z").ok).toBe(false);
  });
});
