import { describe, expect, it } from "vitest";
import { createClinicalWorld, DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { EMPTY_SECTIONS, getConsultationNotesApi, missingForSignOff, saveNoteInputSchema } from "@/modules/consultation-notes";
import { createConsultationNotesFixtureApi, createNotesTestStore } from "@/modules/consultation-notes/fixture";
import en from "@/messages/en/consultationNotes.json";
import te from "@/messages/te/consultationNotes.json";
import hi from "@/messages/hi/consultationNotes.json";

const env = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
const T0 = new Date("2026-11-19T10:00:00Z");
const make = (actor = DEFAULT_DOCTOR_ACTOR) => createConsultationNotesFixtureApi({ env, actor, world: createClinicalWorld(T0), store: createNotesTestStore(), now: () => T0 });
const full = { ...EMPTY_SECTIONS, summary: "Synthetic summary", advice: "Synthetic advice" };

describe("consultation notes fixture", () => {
  it("starts empty, saves a draft, then signs off and becomes read-only", async () => {
    const api = make();
    expect(await api.getNote(I.bookingPast)).toEqual({ ok: true, data: null });
    const d = await api.saveDraft(I.bookingPast, { expectedVersion: 0, sections: full });
    expect(d.ok && d.data.status).toBe("draft");
    const s = await api.signOff(I.bookingPast, { expectedVersion: 1, attest: true });
    expect(s.ok && s.data).toMatchObject({ status: "signed_off", version: 2, signedOffBy: { displayName: expect.any(String) } });
    expect((await api.saveDraft(I.bookingPast, { expectedVersion: 2, sections: full })).ok).toBe(false);
  });

  it("only completed bookings accept notes", async () => {
    const r = await make().saveDraft(I.bookingActive, { expectedVersion: 0, sections: full });
    expect(r).toEqual({ ok: false, error: { code: "conflict" } });
  });

  it("stale versions conflict", async () => {
    const api = make();
    await api.saveDraft(I.bookingPast, { expectedVersion: 0, sections: full });
    expect(await api.saveDraft(I.bookingPast, { expectedVersion: 0, sections: full })).toEqual({ ok: false, error: { code: "conflict" } });
  });

  it("sign-off needs summary and advice", async () => {
    const api = make();
    await api.saveDraft(I.bookingPast, { expectedVersion: 0, sections: { ...EMPTY_SECTIONS, summary: "x" } });
    const r = await api.signOff(I.bookingPast, { expectedVersion: 1, attest: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "validation", fields: { "sections.advice": "required" } });
  });

  it("other actors cannot read or write (privacy-safe forbidden)", async () => {
    const p = make(DEFAULT_PATIENT_ACTOR);
    expect(await p.getNote(I.bookingPast)).toEqual({ ok: false, error: { code: "forbidden" } });
    const other = make({ role: "doctor", doctorId: I.doctorOther });
    expect(await other.saveDraft(I.bookingPast, { expectedVersion: 0, sections: full })).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await make().getNote("00000000-0000-4000-8000-000000000999")).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("validates input (lengths, unknown fields, attest)", async () => {
    expect(saveNoteInputSchema.safeParse({ expectedVersion: 0, sections: { ...EMPTY_SECTIONS, summary: "x".repeat(4001) } }).success).toBe(false);
    expect(saveNoteInputSchema.safeParse({ expectedVersion: 0, sections: { ...EMPTY_SECTIONS, diagnosisCode: "x" } }).success).toBe(false);
    const api = make();
    await api.saveDraft(I.bookingPast, { expectedVersion: 0, sections: full });
    expect(await api.signOff(I.bookingPast, { expectedVersion: 1, attest: false as never })).toEqual({ ok: false, error: { code: "validation" } });
  });

  it("missingForSignOff ignores whitespace-only text", () => {
    expect(missingForSignOff({ ...EMPTY_SECTIONS, summary: "   ", advice: "ok" })).toEqual(["summary"]);
  });
});

describe("getConsultationNotesApi gates", () => {
  it("flag off: gated without touching the adapter", async () => {
    expect(await getConsultationNotesApi({ FRONTEND_ADAPTER: "fixture" }).getNote(I.bookingPast)).toEqual({ ok: false, error: { code: "gated" } });
  });
  it("http adapter is gated", async () => {
    expect(await getConsultationNotesApi({ FEATURE_CLINICAL: "true" }).saveDraft(I.bookingPast, { expectedVersion: 0, sections: full })).toEqual({ ok: false, error: { code: "gated" } });
  });
  it("refuses fixture data in production", () => {
    expect(() => getConsultationNotesApi({ ...env, APP_ENV: "production" }, { fixtureActor: DEFAULT_DOCTOR_ACTOR })).toThrow();
  });
});

describe("messages", () => {
  it("en, te and hi have the same keys", () => {
    const flat = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(flat(te).sort()).toEqual(flat(en).sort());
    expect(flat(hi).sort()).toEqual(flat(en).sort());
  });
});
