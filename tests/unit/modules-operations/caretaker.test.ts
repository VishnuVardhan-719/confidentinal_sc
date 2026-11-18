import { describe, expect, it } from "vitest";
import { careActors, caretakerFixtures } from "@/fixtures/operations/caretaker";
import { createCaretakerFixtureApi } from "@/modules/caretaker/fixture";
import { createCaretakerHttpApi } from "@/modules/caretaker/http";
import {
  careActionDenial,
  careRequestSchema,
  isPermittedCareTask,
  isRecurringCareEnabled,
  rateTotalPaise,
  shiftActionSchema,
  visibleAssignments,
} from "@/modules/caretaker/rules";
import { describeTask } from "@/modules/caretaker/status";

const validRequest = {
  serviceId: "fx-care-svc-1",
  taskCodes: ["companionship", "meal_assistance"],
  period: "hour",
  start: "2026-11-22T03:30:00Z",
  end: "2026-11-22T07:30:00Z",
};

describe("caretaker nonclinical scope", () => {
  it("accepts permitted nonclinical tasks only", () => {
    expect(careRequestSchema.safeParse(validRequest).success).toBe(true);
    for (const clinical of ["medication_administration", "medication_reminder", "injection", "wound_care", "catheter_care", "vitals_recording", "clinical_note", "diagnosis"]) {
      expect(isPermittedCareTask(clinical)).toBe(false);
      expect(careRequestSchema.safeParse({ ...validRequest, taskCodes: ["companionship", clinical] }).success).toBe(false);
      expect(describeTask(clinical).known).toBe(false);
    }
  });

  it("rejects extra clinical fields and duplicate tasks", () => {
    expect(careRequestSchema.safeParse({ ...validRequest, medications: ["x"] }).success).toBe(false);
    expect(careRequestSchema.safeParse({ ...validRequest, notes: "free text" }).success).toBe(false);
    expect(careRequestSchema.safeParse({ ...validRequest, taskCodes: ["companionship", "companionship"] }).success).toBe(false);
  });

  it("fixture data contains no clinical task codes", () => {
    const codes = [...caretakerFixtures.services.flatMap((s) => s.taskCodes), ...caretakerFixtures.assignments.flatMap((a) => a.taskCodes)];
    expect(codes.every(isPermittedCareTask)).toBe(true);
  });
});

describe("recurring plans are gated", () => {
  it("gate is off and both adapters return gated", async () => {
    expect(isRecurringCareEnabled()).toBe(false);
    const input = {
      assignmentId: "fx-care-asg-1",
      plan: { weekdays: [1, 3] as (1 | 3)[], startTime: "09:00", endTime: "13:00", taskCodes: ["companionship" as const], untilDate: "2027-01-31" },
      idempotencyKey: "r1",
    };
    expect(await createCaretakerFixtureApi({ env: {} }).createRecurringPlan(input)).toEqual({ ok: false, error: { code: "gated" } });
    expect(await createCaretakerHttpApi().createRecurringPlan(input)).toEqual({ ok: false, error: { code: "gated" } });
  });
});

describe("staff/agency scoping and shifts", () => {
  it("caregivers see only their own assignments; managers see their agency", () => {
    const all = caretakerFixtures.assignments;
    expect(visibleAssignments(careActors.caregiverA, all).map((a) => a.id)).toEqual(["fx-care-asg-1"]);
    expect(visibleAssignments(careActors.independent, all).map((a) => a.id)).toEqual(["fx-care-asg-3"]);
    expect(visibleAssignments(careActors.agencyManager, all).map((a) => a.id)).toEqual(["fx-care-asg-1", "fx-care-asg-2"]);
  });

  it("only the assigned caregiver starts care, not before the interval", () => {
    const a = caretakerFixtures.assignments[0];
    expect(careActionDenial(careActors.caregiverB, a, "start", { now: new Date("2026-11-20T04:00:00Z") })).toBe("not_assigned");
    expect(careActionDenial(careActors.agencyManager, a, "start", { now: new Date("2026-11-20T04:00:00Z") })).toBe("not_assigned");
    expect(careActionDenial(careActors.caregiverA, a, "start", { now: new Date("2026-11-20T03:00:00Z") })).toBe("too_early");
    expect(careActionDenial(careActors.caregiverA, a, "start", { now: new Date("2026-11-20T04:00:00Z") })).toBeNull();
    expect(careActionDenial(careActors.agencyManager, a, "interrupt", { reason: "unsafe_conditions" })).toBeNull();
  });

  it("check-in uses the server clock; client timestamps are rejected", async () => {
    expect(shiftActionSchema.safeParse({ expectedVersion: 1 }).success).toBe(true);
    expect(shiftActionSchema.safeParse({ expectedVersion: 1, checkInAt: "2026-11-20T00:00:00Z" }).success).toBe(false);
    const serverNow = new Date("2026-11-20T03:31:00Z");
    const api = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => serverNow });
    const result = await api.checkIn({ shiftId: "fx-shift-1", expectedVersion: 1, idempotencyKey: "c1" });
    expect(result.ok && result.data.checkInAt).toBe(serverNow.toISOString());
    const other = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverB });
    expect(await other.checkIn({ shiftId: "fx-shift-1", expectedVersion: 1, idempotencyKey: "c2" })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("manager assigns an eligible replacement for an absent shift only", async () => {
    const api = createCaretakerFixtureApi({ env: {}, actor: careActors.agencyManager, now: () => new Date("2026-11-20T03:10:00Z") });
    const ineligible = await api.assignReplacement({ shiftId: "fx-shift-3", expectedVersion: 2, idempotencyKey: "x1", replacementResourceId: "fx-res-care-c" });
    expect(ineligible.ok).toBe(false);
    const ok = await api.assignReplacement({ shiftId: "fx-shift-3", expectedVersion: 2, idempotencyKey: "x2", replacementResourceId: "fx-res-care-b" });
    expect(ok.ok && ok.data.attendance).toBe("replaced");
    const caregiverApi = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA });
    expect((await caregiverApi.listStaff()).ok).toBe(false);
  });

  it("rate totals stay integer paise", () => {
    expect(rateTotalPaise(30000, 4)).toBe(120000);
    expect(rateTotalPaise(300.5, 4)).toBeNull();
    expect(rateTotalPaise(30000, 0)).toBeNull();
  });
});

describe("fixture reads return snapshots", () => {
  it("mutating a returned record or advancing state later does not change a retained result", async () => {
    const api = createCaretakerFixtureApi({ env: {}, actor: careActors.caregiverA, now: () => new Date("2026-11-20T04:00:00Z") });
    const first = await api.getAssignment("fx-care-asg-1");
    if (!first.ok) throw new Error("expected assignment");
    expect(first.data.substate).toBe("assigned");

    // Caller-side mutation must not leak into the adapter.
    first.data.substate = "ended";
    first.data.taskCodes.push("light_household_help");
    const again = await api.getAssignment("fx-care-asg-1");
    expect(again.ok && again.data.substate).toBe("assigned");
    expect(again.ok && again.data.taskCodes).toEqual(["companionship", "mobility_assistance"]);

    // A later state change must not show through a retained result.
    const retained = await api.listAssignments();
    const retainedShifts = await api.listShifts({ assignmentId: "fx-care-asg-1" });
    const started = await api.performCareAction({ assignmentId: "fx-care-asg-1", action: "start", expectedVersion: 2, idempotencyKey: "snap-1" });
    expect(started.ok && started.data.substate).toBe("started");
    expect(again.ok && again.data.substate).toBe("assigned");
    expect(retained.ok && retained.data[0].substate).toBe("assigned");

    await api.checkIn({ shiftId: "fx-shift-1", expectedVersion: 1, idempotencyKey: "snap-2" });
    expect(retainedShifts.ok && retainedShifts.data.find((s) => s.id === "fx-shift-1")?.checkInAt).toBeNull();
  });

  it("list reads for services, staff and requests are snapshots too", async () => {
    const api = createCaretakerFixtureApi({ env: {}, actor: careActors.agencyManager });
    const services = await api.listServices();
    const staff = await api.listStaff();
    const requests = await api.listRequests();
    if (!services.ok || !staff.ok || !requests.ok) throw new Error("expected data");
    services.data[0].rates[0].amountPaise = 1;
    staff.data[0].skills.length = 0;
    requests.data.items[0].rateSnapshot.totalPaise = 1;
    const [s2, st2, r2] = await Promise.all([api.listServices(), api.listStaff(), api.listRequests()]);
    expect(s2.ok && s2.data[0].rates[0].amountPaise).toBe(30000);
    expect(st2.ok && st2.data[0].skills.length).toBe(3);
    expect(r2.ok && r2.data.items[0].rateSnapshot.totalPaise).toBe(120000);
  });
});
