import { describe, expect, it } from "vitest";
import { createClinicalWorld, DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR, FIXTURE_IDS as I } from "@/fixtures/clinical/world";
import { emptyRow, getPrescriptionDraftsApi, parseRow, prescriptionDraftSchema, rowFromItem, saveDraftInputSchema, type DraftItem } from "@/modules/prescription-drafts";
import { createDraftsTestStore, createPrescriptionDraftsFixtureApi } from "@/modules/prescription-drafts/fixture";
import en from "@/messages/en/prescriptionDrafts.json";
import te from "@/messages/te/prescriptionDrafts.json";
import hi from "@/messages/hi/prescriptionDrafts.json";

const env = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
const T0 = new Date("2026-11-19T10:00:00Z");
const make = (actor = DEFAULT_DOCTOR_ACTOR) => createPrescriptionDraftsFixtureApi({ env, actor, world: createClinicalWorld(T0), store: createDraftsTestStore(), now: () => T0 });
const item: DraftItem = { key: "row-1", medicineName: "Synthetic medicine", form: "tablet", strength: "500 mg", schedule: "twice_daily", durationDays: 5, instruction: "after_food" };

describe("parseRow", () => {
  it("accepts a complete row and trims text", () => {
    const r = parseRow({ ...rowFromItem(item), medicineName: "  Synthetic medicine  ", strength: " 500 mg " });
    expect(r).toEqual({ ok: true, item });
  });
  it("lists every missing or invalid field in order", () => {
    expect(parseRow(emptyRow("row-2"))).toEqual({ ok: false, errors: ["medicineName", "form", "schedule", "durationDays", "instruction"] });
    for (const bad of ["0", "91", "2.5", "-1", "abc", "1e2"]) expect(parseRow({ ...rowFromItem(item), durationText: bad })).toEqual({ ok: false, errors: ["durationDays"] });
  });
});

describe("prescription drafts fixture", () => {
  it("saves, updates and discards a draft; status is always draft (never issued)", async () => {
    const api = make();
    expect(await api.getDraft(I.bookingPast)).toEqual({ ok: true, data: null });
    const a = await api.saveDraft(I.bookingPast, { expectedVersion: 0, items: [item] });
    expect(a.ok && a.data).toMatchObject({ status: "draft", version: 1 });
    const b = await api.saveDraft(I.bookingPast, { expectedVersion: 1, items: [item, { ...item, key: "row-2", medicineName: "Second synthetic" }] });
    expect(b.ok && b.data.items).toHaveLength(2);
    expect(await api.discardDraft(I.bookingPast, { expectedVersion: 2 })).toEqual({ ok: true, data: null });
    expect(await api.getDraft(I.bookingPast)).toEqual({ ok: true, data: null });
  });
  it("completed bookings only; stale versions conflict", async () => {
    const api = make();
    expect(await api.saveDraft(I.bookingActive, { expectedVersion: 0, items: [item] })).toEqual({ ok: false, error: { code: "conflict" } });
    await api.saveDraft(I.bookingPast, { expectedVersion: 0, items: [item] });
    expect(await api.saveDraft(I.bookingPast, { expectedVersion: 0, items: [item] })).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await api.discardDraft(I.bookingPast, { expectedVersion: 9 })).toEqual({ ok: false, error: { code: "conflict" } });
  });
  it("other actors are denied (privacy-safe)", async () => {
    expect(await make(DEFAULT_PATIENT_ACTOR).getDraft(I.bookingPast)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await make({ role: "doctor", doctorId: I.doctorOther }).saveDraft(I.bookingPast, { expectedVersion: 0, items: [item] })).toEqual({ ok: false, error: { code: "forbidden" } });
  });
  it("validates items: no empty list, max 10, no unknown fields, no issued status", () => {
    expect(saveDraftInputSchema.safeParse({ expectedVersion: 0, items: [] }).success).toBe(false);
    expect(saveDraftInputSchema.safeParse({ expectedVersion: 0, items: Array.from({ length: 11 }, (_, i) => ({ ...item, key: `row-${i}` })) }).success).toBe(false);
    expect(saveDraftInputSchema.safeParse({ expectedVersion: 0, items: [{ ...item, drugCode: "X1" }] }).success).toBe(false);
    expect(prescriptionDraftSchema.safeParse({ bookingId: "b", status: "issued", version: 1, items: [], updatedAt: T0.toISOString() }).success).toBe(false);
  });
});

describe("gates and messages", () => {
  it("flag off and http are gated; fixture refused in production", async () => {
    expect(await getPrescriptionDraftsApi({ FRONTEND_ADAPTER: "fixture" }).getDraft(I.bookingPast)).toEqual({ ok: false, error: { code: "gated" } });
    expect(await getPrescriptionDraftsApi({ FEATURE_CLINICAL: "true" }).getDraft(I.bookingPast)).toEqual({ ok: false, error: { code: "gated" } });
    expect(() => getPrescriptionDraftsApi({ ...env, APP_ENV: "production" }, { fixtureActor: DEFAULT_DOCTOR_ACTOR })).toThrow();
  });
  it("en, te and hi have the same keys", () => {
    const flat = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(flat(te).sort()).toEqual(flat(en).sort());
    expect(flat(hi).sort()).toEqual(flat(en).sort());
  });
});
