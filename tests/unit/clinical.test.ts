import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLINICAL_RULES, VITAL_WARNING_ORDER, allergyConflicts, vitalWarnings } from "@/lib/clinical/rules";
import { amendSchema, clinicalContentSchema, draftSaveSchema, signSchema } from "@/lib/validation/clinical";

const migration = (name: string) => readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", name), "utf8");
const model = migration("20261117002300_dc_clinical_model.sql");
const commands = migration("20261117002310_dc_clinical_commands.sql");

const complete = {
  vitals: { temperature: { value: 37.0, unit: "C" }, systolic: 120, diastolic: 80, pulse_bpm: 78, spo2_pct: 98, resp_rate: 16 },
  examination: { chief_complaint: "Synthetic cough", symptom_duration: "3 days", findings: "Synthetic chest clear" },
  assessment: { summary: "Synthetic viral illness", certainty: "provisional", diagnoses: [{ label: "Synthetic URI", certainty: "probable" }], outcome: "follow_up" },
  allergies: { status: "recorded", items: [{ substance: "Penicillin", reaction: "Synthetic rash" }] },
  prescription: { status: "prescribed", items: [{ medication_name: "Paracetamol", form: "tablet", strength: "500 mg", dose: "1 tablet",
    route: "oral", frequency: "three_times_daily", duration_days: 3, quantity: 9 }] },
  plan: { advice: "Synthetic rest", follow_up_on: "2026-12-01", tests: [{ name: "Synthetic CBC" }] },
};
const ok = (content: unknown) => clinicalContentSchema.safeParse(content).success;
const withVitals = (v: Record<string, unknown>) => ({ vitals: v });

describe("rules parity with clinical_private.rules() (design A3)", () => {
  it("the SQL JSON literal equals CLINICAL_RULES", () => {
    const literal = model.match(/select '(\{[\s\S]*?\})'::jsonb; -- END PARITY/);
    expect(literal).not.toBeNull();
    expect(JSON.parse(literal![1])).toEqual(CLINICAL_RULES);
  });
  it("vital_warnings iterates readings in VITAL_WARNING_ORDER", () => {
    const loop = model.match(/foreach k in array array\[([^\]]+)\] loop/);
    expect(loop![1].split(",").map(s => s.trim().replace(/'/g, ""))).toEqual([...VITAL_WARNING_ORDER]);
  });
  it("every warning code that vitalWarnings can emit is in the enum", () => {
    const codes = Object.values(CLINICAL_RULES.vitals).flatMap(l => "code" in l
      ? [..."warn_below" in l ? [`${l.code}_low`] : [], ..."warn_from" in l ? [`${l.code}_high`] : []] : []);
    expect(new Set(codes)).toEqual(new Set(CLINICAL_RULES.enums.vital_warnings));
  });
});

describe("content validation mirrors check_content(content, false)", () => {
  it("accepts complete and empty and partial drafts", () => {
    expect(ok(complete)).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ prescription: { items: [{ medication_name: "Para" }] } })).toBe(true);
  });
  it.each([
    ["unknown top-level key", { notes: "x" }],
    ["unknown vital", withVitals({ glucose: 5 })],
    ["null instead of absent", withVitals({ pulse_bpm: null })],
    ["string number", withVitals({ pulse_bpm: "80" })],
    ["temperature without unit", withVitals({ temperature: { value: 37 } })],
    ["unknown unit", withVitals({ temperature: { value: 37, unit: "K" } })],
    ["Celsius above hard limit", withVitals({ temperature: { value: 46, unit: "C" } })],
    ["Celsius value sent as Fahrenheit", withVitals({ temperature: { value: 37, unit: "F" } })],
    ["two decimals", withVitals({ temperature: { value: 38.25, unit: "C" } })],
    ["spo2 above 100", withVitals({ spo2_pct: 101 })],
    ["fractional pulse", withVitals({ pulse_bpm: 80.5 })],
    ["systolic without diastolic", withVitals({ systolic: 120 })],
    ["diastolic not below systolic", withVitals({ systolic: 80, diastolic: 80 })],
    ["unknown warning acknowledged", withVitals({ acknowledged_warnings: ["fever"] })],
    ["duplicate acknowledgment", withVitals({ acknowledged_warnings: ["spo2_low", "spo2_low"] })],
    ["blank findings", { examination: { findings: "   " } }],
    ["findings over limit", { examination: { findings: "x".repeat(4001) } }],
    ["unknown certainty", { assessment: { certainty: "certain" } }],
    ["bad diagnosis code", { assessment: { diagnoses: [{ label: "x", code: "j06" }] } }],
    ["too many diagnoses", { assessment: { diagnoses: Array.from({ length: 11 }, () => ({ label: "x" })) } }],
    ["unknown route", { prescription: { items: [{ route: "mouth" }] } }],
    ["duration over a year", { prescription: { items: [{ duration_days: 366 }] } }],
    ["too many items", { prescription: { items: Array.from({ length: 16 }, () => ({})) } }],
    ["impossible date", { plan: { follow_up_on: "2026-02-30" } }],
    ["date with time", { plan: { follow_up_on: "2026-12-01T10:00:00Z" } }],
  ])("rejects %s", (_, content) => {
    expect(ok(content)).toBe(false);
  });
  it("keeps dangerous but plausible readings as entered (DC04)", () => {
    const v = { temperature: { value: 40.1, unit: "C" }, systolic: 85, diastolic: 50, pulse_bpm: 140, spo2_pct: 85, resp_rate: 32 };
    const parsed = clinicalContentSchema.parse(withVitals(v));
    expect(parsed.vitals).toEqual(v);
  });
  it("Fahrenheit uses its own limits", () => {
    expect(ok(withVitals({ temperature: { value: 98.6, unit: "F" } }))).toBe(true);
    expect(ok(withVitals({ temperature: { value: 114, unit: "F" } }))).toBe(false);
  });
});

describe("vital warnings (same algorithm as clinical_private.vital_warnings)", () => {
  it("none for normal readings", () => {
    expect(vitalWarnings(complete.vitals as never)).toEqual([]);
  });
  it("low and high codes in the database order", () => {
    expect(vitalWarnings({ temperature: { value: 40.1, unit: "C" }, systolic: 185, diastolic: 125, pulse_bpm: 35, spo2_pct: 85, resp_rate: 6 }))
      .toEqual(["temperature_high", "systolic_high", "diastolic_high", "pulse_low", "spo2_low", "resp_rate_low"]);
    expect(vitalWarnings({ temperature: { value: 94, unit: "F" }, systolic: 85, diastolic: 50, pulse_bpm: 131, resp_rate: 31 }))
      .toEqual(["temperature_low", "systolic_low", "pulse_high", "resp_rate_high"]);
  });
  it("boundaries: warn_from is inclusive, warn_below is exclusive", () => {
    expect(vitalWarnings({ temperature: { value: 39.5, unit: "C" } })).toEqual(["temperature_high"]);
    expect(vitalWarnings({ temperature: { value: 35, unit: "C" } })).toEqual([]);
    expect(vitalWarnings({ spo2_pct: 92 })).toEqual([]);
  });
});

describe("allergy name match (DC08, design DCQ-6)", () => {
  const rx = (...names: string[]) => ({ items: names.map(medication_name => ({ medication_name })) });
  it("matches either direction, case-insensitive", () => {
    expect(allergyConflicts({ prescription: rx("Paracetamol", "Penicillin V potassium"), allergies: { items: [{ substance: "penicillin" }] } })).toEqual([2]);
    expect(allergyConflicts({ prescription: rx("Ibuprofen"), allergies: { items: [{ substance: "ibuprofen tablets" }] } })).toEqual([1]);
  });
  it("ignores substances shorter than three characters and does not know drug classes", () => {
    expect(allergyConflicts({ prescription: rx("Iron syrup"), allergies: { items: [{ substance: "ir" }] } })).toEqual([]);
    expect(allergyConflicts({ prescription: rx("Amoxicillin"), allergies: { items: [{ substance: "Penicillin" }] } })).toEqual([]);
  });
  it("one line is reported once", () => {
    expect(allergyConflicts({ prescription: rx("Aspirin"), allergies: { items: [{ substance: "aspirin" }, { substance: "ASPIRIN" }] } })).toEqual([1]);
  });
});

describe("command bodies", () => {
  it("draft save allows version 0 and rejects extra keys", () => {
    expect(draftSaveSchema.safeParse({ expectedVersion: 0, content: {} }).success).toBe(true);
    expect(draftSaveSchema.safeParse({ expectedVersion: 0, content: {}, status: "signed" }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ expectedVersion: -1, content: {} }).success).toBe(false);
  });
  it("sign requires an explicit authorship confirmation", () => {
    expect(signSchema.safeParse({ expectedVersion: 3, authoredConfirmed: true, allergiesReviewed: false }).success).toBe(true);
    expect(signSchema.safeParse({ expectedVersion: 3, authoredConfirmed: false, allergiesReviewed: true }).success).toBe(false);
    expect(signSchema.safeParse({ expectedVersion: 0, authoredConfirmed: true, allergiesReviewed: true }).success).toBe(false);
  });
  it("amend requires a reason", () => {
    expect(amendSchema.safeParse({ content: complete, reason: "Synthetic dose correction", authoredConfirmed: true, allergiesReviewed: true }).success).toBe(true);
    expect(amendSchema.safeParse({ content: complete, reason: " ", authoredConfirmed: true, allergiesReviewed: true }).success).toBe(false);
  });
});

describe("static checks on the clinical migrations (DB NOT EXECUTED)", () => {
  it.each([["model", model], ["commands", commands]])("%s is marked DB NOT EXECUTED", (_, sql) => {
    expect(sql).toContain("DB NOT EXECUTED");
  });
  it("no clinical command writes booking events, the outbox or N01 sources", () => {
    for (const sql of [model, commands]) {
      expect(sql).not.toMatch(/insert\s+into\s+public\.(booking_events|notification_outbox|notifications)/i);
      expect(sql).not.toMatch(/notify_private/i);
      expect(sql).not.toMatch(/raise\s+(notice|log|info|warning)/i);
    }
  });
  it("no privilege is granted to anon or service_role, and audit rows carry ids only", () => {
    for (const sql of [model, commands]) expect(sql).not.toMatch(/grant[^;]*to[^;]*(anon|service_role|public)\b/i);
    for (const m of commands.matchAll(/insert into public\.audit_events\(([^)]*)\)/g)) {
      expect(m[1]).toBe("actor_profile_id,action,target_type,target_id");
    }
  });
  it("the gate is seeded off and every write checks it", () => {
    expect(model).toContain("insert into booking_private.feature_gates(key) values ('doctor_clinical') on conflict do nothing;");
    for (const fn of ["save_clinical_draft", "sign_clinical_record", "amend_clinical_record"]) {
      const body = commands.split(`create function public.${fn}(`)[1].split("end $$;")[0];
      expect(body.match(/clinical_private\.require_on\(\)/g)?.length).toBe(2);
      expect(body).toContain("booking_private.replay(");
      expect(body).toContain("booking_private.record_request(");
    }
  });
});
