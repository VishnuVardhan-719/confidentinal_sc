import { describe, expect, it } from "vitest";
import { createClinicalWorld, FIXTURE_IDS as I, type ClinicalWorld } from "@/fixtures/clinical/world";
import { createClinicalFixtureApi } from "@/modules/clinical/fixture";
import { createDoctorFixtureApi } from "@/modules/doctor/fixture";
import { pdfLinkState } from "@/modules/clinical/pdf";
import { createRecordsFixtureApi } from "@/modules/records/fixture";
import { factBadge, isMinimalPublicProof, proofState } from "@/modules/records/logic";
import { collectionInputSchema, photoUploadInputSchema, PHOTO_MAX_BYTES, type HealthFactView } from "@/modules/records/types";
import type { ClinicalDraftContent } from "@/modules/clinical/schemas";

const T0 = new Date("2026-11-20T04:30:00.000Z");

function worldWithClock() {
  const world = createClinicalWorld(T0);
  let clock = T0;
  return { world, now: () => clock, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}
const asDoctor = (world: ClinicalWorld, now: () => Date, doctorId: string = I.doctorAssigned) => createRecordsFixtureApi({ world, now, actor: { role: "doctor", doctorId } });
const asPatient = (world: ClinicalWorld, now: () => Date, patientId: string = I.patientA) => createRecordsFixtureApi({ world, now, actor: { role: "patient", patientId } });

describe("DC09 patient authorized record views", () => {
  it("lists only the patient's own final records; drafts are hidden", async () => {
    const { world, now } = worldWithClock();
    const r = await asPatient(world, now).listMyRecords();
    expect(r.ok && r.data.map((x) => x.consultationId)).toEqual([I.consultationPastFinal]);
    expect(await asPatient(world, now).getMyRecord(I.consultationActive)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("another patient (or family member without grant) is denied", async () => {
    const { world, now } = worldWithClock();
    expect(await asPatient(world, now, I.patientB).getMyRecord(I.consultationPastFinal)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await asDoctor(world, now).listMyRecords()).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("DC10 collection state independent of record finalization", () => {
  const content: ClinicalDraftContent = {
    vitals: {},
    assessment: { chiefComplaint: "Synthetic", assessmentType: "provisional" },
    prescription: { prescription: { mode: "none" } },
    care: { followUp: { mode: "not_required" } },
  };

  it("an unpaid (DUE, no collection) visit can still be finalized", async () => {
    const { world, now } = worldWithClock();
    const col = await asDoctor(world, now).getCollection(I.bookingActive);
    expect(col.ok && col.data).toMatchObject({ status: "not_recorded", paymentState: "DUE" });
    const clinical = createClinicalFixtureApi({ world, now });
    const saved = await clinical.saveDraft(I.consultationActive, { expectedVersion: 1, content });
    expect(saved.ok).toBe(true);
    expect((await clinical.finalize(I.consultationActive, { expectedVersion: 2, acknowledged: true }, "f1")).ok).toBe(true);
  });

  it("recording cash/UPI never flips the gateway payment state; UPI needs a reference", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    expect(collectionInputSchema.safeParse({ method: "upi_direct", amountPaise: 80_000 }).success).toBe(false);
    expect(collectionInputSchema.safeParse({ method: "cash", amountPaise: 800.5 }).success).toBe(false);
    const r = await api.recordCollection(I.bookingActive, { method: "cash", amountPaise: 80_000 }, "c1");
    expect(r.ok && r.data).toMatchObject({ status: "recorded", paymentState: "DUE", record: { method: "cash", amountPaise: 80_000 } });
    expect((await api.recordCollection(I.bookingActive, { method: "cash", amountPaise: 80_000 }, "c1")).ok).toBe(true); // idempotent retry
    expect(await api.recordCollection(I.bookingActive, { method: "cash", amountPaise: 80_000 }, "c2")).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await asDoctor(world, now, I.doctorOther).recordCollection(I.bookingActive, { method: "cash", amountPaise: 1 }, "c3")).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("DC11 health fact review and history", () => {
  it("entering a consultation verifies nothing; only reviewed facts are confirmed with attribution", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    const before = await api.listHealthFacts(I.bookingActive);
    if (!before.ok) throw new Error("facts");
    expect(before.data.every((f) => factBadge(f) === "patient_entered")).toBe(true);
    const confirmed = await api.confirmHealthFacts(I.bookingActive, { facts: [{ factId: "fact-a-blood", expectedVersion: 1 }], evidenceNote: "Synthetic card reviewed", reviewAcknowledged: true });
    expect(confirmed.ok).toBe(true);
    const after = await api.listHealthFacts(I.bookingActive);
    if (!after.ok) throw new Error("facts");
    const blood = after.data.find((f) => f.factId === "fact-a-blood")!;
    const allergy = after.data.find((f) => f.factId === "fact-a-allergy")!;
    expect(factBadge(blood)).toBe("doctor_verified");
    expect(blood.current.verifier?.clinicianId).toBe(I.doctorAssigned);
    expect(blood.history).toHaveLength(1);
    expect(blood.history[0]).toMatchObject({ version: 1, source: "patient_entered" });
    expect(factBadge(allergy)).toBe("patient_entered");
  });

  it("a verified flag without verifier/evidence is not displayed as verified", () => {
    const fake: HealthFactView = { factId: "x", kind: "allergy", current: { version: 2, value: "v", source: "doctor_verified", recordedAt: T0.toISOString(), verifier: null, evidenceNote: null }, history: [] };
    expect(factBadge(fake)).toBe("unverified_claim");
  });

  it("stale version, missing ack and another patient's fact are rejected", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    expect(await api.confirmHealthFacts(I.bookingActive, { facts: [{ factId: "fact-a-blood", expectedVersion: 7 }], evidenceNote: "Synthetic", reviewAcknowledged: true })).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await api.confirmHealthFacts(I.bookingActive, { facts: [{ factId: "fact-b-blood", expectedVersion: 1 }], evidenceNote: "Synthetic", reviewAcknowledged: true })).toEqual({ ok: false, error: { code: "forbidden" } });
    const noAck = { facts: [{ factId: "fact-a-blood", expectedVersion: 1 }], evidenceNote: "Synthetic", reviewAcknowledged: false } as unknown as Parameters<typeof api.confirmHealthFacts>[1];
    expect(await api.confirmHealthFacts(I.bookingActive, noAck)).toEqual({ ok: false, error: { code: "validation" } });
  });
});

describe("DC12 revocable, expiring proof of visit", () => {
  it("token is opaque and the public view carries no PHI or OTP", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    const p = await api.issueProof(I.bookingActive, "p1");
    if (!p.ok) throw new Error("proof");
    expect(p.data.token).toMatch(/^[a-f0-9]{32}$/);
    for (const secret of [I.patientA, "Fixture Patient A", "+910000000000", "Synthetic Nagar", "500001"]) expect(p.data.token).not.toContain(secret);
    const v = await api.verifyProof(p.data.token);
    if (!v.ok) throw new Error("verify");
    expect(v.data.status).toBe("valid");
    expect(isMinimalPublicProof(v.data)).toBe(true);
    expect(JSON.stringify(v.data)).not.toMatch(/Patient|Nagar|500001|\+91|allergy|complaint/i);
  });

  it("expired and revoked tokens are handled; regeneration revokes the previous token", async () => {
    const { world, now, advance } = worldWithClock();
    const api = asDoctor(world, now);
    const first = await api.issueProof(I.bookingActive, "p1");
    const second = await api.issueProof(I.bookingActive, "p2");
    if (!first.ok || !second.ok) throw new Error("proof");
    expect(await api.verifyProof(first.data.token)).toEqual({ ok: true, data: { status: "revoked" } });
    advance(24 * 60 * 60_000);
    expect(await api.verifyProof(second.data.token)).toEqual({ ok: true, data: { status: "expired" } });
    expect(proofState(second.data, now())).toBe("expired");
    expect(await api.verifyProof("not-a-token")).toEqual({ ok: true, data: { status: "not_found" } });
  });

  it("cannot issue proof before arrival verification or as another doctor", async () => {
    const { world, now } = worldWithClock();
    expect(await asDoctor(world, now).issueProof(I.bookingToday, "p1")).toEqual({ ok: false, error: { code: "conflict" } });
    expect(await asDoctor(world, now, I.doctorOther).issueProof(I.bookingActive, "p2")).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("DC13 optional photo consent and private upload", () => {
  it("decline is allowed, blocks upload and does not block finalization", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    expect((await api.recordPhotoConsent(I.consultationActive, { decision: "decline" })).ok).toBe(true);
    expect(await api.registerPhotoUpload(I.consultationActive, { contentType: "image/jpeg", sizeBytes: 1000 })).toEqual({ ok: false, error: { code: "forbidden" } });
    const clinical = createClinicalFixtureApi({ world, now });
    await clinical.saveDraft(I.consultationActive, { expectedVersion: 1, content: { vitals: {}, assessment: { chiefComplaint: "S", assessmentType: "provisional" }, prescription: { prescription: { mode: "none" } }, care: { followUp: { mode: "not_required" } } } });
    expect((await clinical.finalize(I.consultationActive, { expectedVersion: 2, acknowledged: true }, "f")).ok).toBe(true);
  });

  it("unauthorized file access is denied; withdrawal removes access", async () => {
    const { world, now } = worldWithClock();
    const api = asDoctor(world, now);
    expect(photoUploadInputSchema.safeParse({ contentType: "image/gif", sizeBytes: 10 }).success).toBe(false);
    expect(photoUploadInputSchema.safeParse({ contentType: "image/png", sizeBytes: PHOTO_MAX_BYTES + 1 }).success).toBe(false);
    await api.recordPhotoConsent(I.consultationActive, { decision: "consent", purpose: "Synthetic documented purpose", patientConfirmed: true });
    const up = await api.registerPhotoUpload(I.consultationActive, { contentType: "image/png", sizeBytes: 2048 });
    if (!up.ok) throw new Error("upload");
    expect(up.data).not.toHaveProperty("url");
    // Not yet scanned clean: no link.
    expect(await api.requestPhotoViewLink(up.data.photoId)).toEqual({ ok: false, error: { code: "forbidden" } });
    world.photos.get(up.data.photoId)!.scanStatus = "clean";
    expect((await api.requestPhotoViewLink(up.data.photoId)).ok).toBe(true);
    expect(await asDoctor(world, now, I.doctorOther).requestPhotoViewLink(up.data.photoId)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await asPatient(world, now, I.patientB).requestPhotoViewLink(up.data.photoId)).toEqual({ ok: false, error: { code: "forbidden" } });
    await api.recordPhotoConsent(I.consultationActive, { decision: "withdrawn" });
    expect(await api.requestPhotoViewLink(up.data.photoId)).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("DC14 signed-version PDF link", () => {
  it("returns the correct patient's latest signed version, never a draft", async () => {
    const { world, now } = worldWithClock();
    const patient = asPatient(world, now);
    const l = await patient.requestMyRecordPdfLink(I.consultationPastFinal);
    expect(l.ok && l.data.version).toBe(1);
    expect(await patient.requestMyRecordPdfLink(I.consultationActive)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await asPatient(world, now, I.patientB).requestMyRecordPdfLink(I.consultationPastFinal)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await createClinicalFixtureApi({ world, now }).requestPdfLink(I.consultationActive)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("expired link moves to a recovery state and a new link can be requested", async () => {
    const { world, now, advance } = worldWithClock();
    const patient = asPatient(world, now);
    const l = await patient.requestMyRecordPdfLink(I.consultationPastFinal);
    if (!l.ok) throw new Error("pdf");
    expect(pdfLinkState(l.data, now()).kind).toBe("ready");
    advance(5 * 60_000);
    expect(pdfLinkState(l.data, now())).toEqual({ kind: "expired", version: 1, recovery: "request_new_link" });
    expect(pdfLinkState(l.data, T0, 2).kind).toBe("version_mismatch");
    const fresh = await patient.requestMyRecordPdfLink(I.consultationPastFinal);
    expect(fresh.ok && pdfLinkState(fresh.data, now()).kind).toBe("ready");
  });
});

describe("doctor fixture + records share one synthetic world", () => {
  it("proof becomes issuable after real arrival verification through the doctor API", async () => {
    const { world, now } = worldWithClock();
    const codes: string[] = [];
    const doctor = createDoctorFixtureApi({ world, now, generateCode: () => "424242", deliverToPatient: (_b, c) => codes.push(c) });
    const v = await doctor.getVisit(I.bookingToday);
    if (!v.ok) throw new Error("visit");
    const e = await doctor.enRoute(I.bookingToday, { expectedVersion: v.data.version });
    const a = e.ok ? await doctor.arrive(I.bookingToday, { expectedVersion: e.data.version }) : e;
    const ch = a.ok ? await doctor.getArrivalChallenge(I.bookingToday) : a;
    if (!ch.ok) throw new Error("challenge");
    expect((await doctor.verifyArrival(I.bookingToday, { challengeId: ch.data.challengeId, code: codes[0] })).ok).toBe(true);
    expect((await asDoctor(world, now).issueProof(I.bookingToday, "k")).ok).toBe(true);
  });
});
