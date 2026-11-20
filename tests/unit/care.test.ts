import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARE_INTERRUPT_REASONS, CARE_TASKS, careAttestSchema, careInterruptSchema, careStepSchema, careTasksSchema } from "@/lib/validation/care";

const migration = (name: string) => readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", name), "utf8");
const quoted = (text: string) => Array.from(text.matchAll(/'([a-z_]+)'/g), m => m[1]);

describe("care validation (design V1)", () => {
  it.each([
    ["state", { expectedVersion: 3, state: "completed" }], ["startedAt", { expectedVersion: 3, startedAt: "2027-01-01T00:00:00Z" }],
    ["endedAt", { expectedVersion: 3, endedAt: "2027-01-01T00:00:00Z" }], ["actorId", { expectedVersion: 3, actorId: "x" }],
    ["notes", { expectedVersion: 3, notes: "free text" }], ["taskCodes", { expectedVersion: 3, taskCodes: ["companionship"] }],
    ["amountPaise", { expectedVersion: 3, amountPaise: "100" }],
  ])("start/end bodies reject %s", (_, body) => expect(careStepSchema.safeParse(body).success).toBe(false));

  it("commands need a positive version; the first task save may send 0", () => {
    expect(careStepSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(careStepSchema.safeParse({ expectedVersion: 4 }).success).toBe(true);
    expect(careTasksSchema.safeParse({ taskCodes: ["companionship"], expectedVersion: 0 }).success).toBe(true);
    expect(careTasksSchema.safeParse({ taskCodes: ["companionship"], expectedVersion: -1 }).success).toBe(false);
    expect(careAttestSchema.safeParse({ expectedVersion: 0, decision: "confirmed" }).success).toBe(false);
  });

  it("task lists are closed, unique and 1 to 6 long", () => {
    for (const taskCodes of [[], ["medication_reminder"], ["wound_care"], ["vitals"], ["companionship", "companionship"], [...CARE_TASKS, "companionship"], [""]])
      expect(careTasksSchema.safeParse({ taskCodes, expectedVersion: 1 }).success).toBe(false);
    expect(careTasksSchema.safeParse({ taskCodes: [...CARE_TASKS], expectedVersion: 1 }).success).toBe(true);
    expect(careTasksSchema.safeParse({ taskCodes: ["companionship"], expectedVersion: 1, providerId: "x" }).success).toBe(false);
  });

  it("interruption reasons and decisions are closed", () => {
    for (const reason of CARE_INTERRUPT_REASONS) expect(careInterruptSchema.safeParse({ expectedVersion: 5, reason }).success).toBe(true);
    for (const reason of ["clinical", "unable_to_service", "ended_for_emergency "]) expect(careInterruptSchema.safeParse({ expectedVersion: 5, reason }).success).toBe(false);
    expect(careAttestSchema.safeParse({ expectedVersion: 2, decision: "disputed" }).success).toBe(true);
    expect(careAttestSchema.safeParse({ expectedVersion: 2, decision: "maybe" }).success).toBe(false);
    expect(careAttestSchema.safeParse({ expectedVersion: 2, decision: "confirmed", attestedAt: "now" }).success).toBe(false);
  });
});

describe("TypeScript lists match the migrations (design V2)", () => {
  it("CARE_TASKS equals care_private.valid_tasks", () => {
    const sql = migration("20261117001900_p5c_care_scope.sql");
    const list = /p<@array\[([^\]]+)\]::text\[\]/.exec(sql);
    expect(list).not.toBeNull();
    expect(quoted(list![1])).toEqual([...CARE_TASKS]);
  });
  it("CARE_INTERRUPT_REASONS equals the care_plans CHECK", () => {
    const sql = migration("20261117001910_p5c_care_plans.sql");
    const list = /interruption_reason text check \(interruption_reason in \(([^)]+)\)\)/.exec(sql);
    expect(list).not.toBeNull();
    expect(quoted(list![1])).toEqual([...CARE_INTERRUPT_REASONS]);
  });
  it("every interruption reason is mapped in interrupt_care", () => {
    const sql = migration("20261117001920_p5c_care_commands.sql");
    for (const reason of CARE_INTERRUPT_REASONS) expect(sql).toContain(`when '${reason}' then`);
  });
});
