import { describe, expect, it, vi } from "vitest";
import { clinicalGate, getClinicalApi, isClinicalEnabled } from "@/modules/clinical";
import { emptyDraftContent } from "@/modules/clinical/schemas";
import { createClinicalHttpApi } from "@/modules/clinical/http";
import { getDoctorApi } from "@/modules/doctor";
import { createDoctorHttpApi } from "@/modules/doctor/http";
import { getRecordsApi } from "@/modules/records";
import { createRecordsHttpApi } from "@/modules/records/http";
import { createClinicalWorld, SYNTHETIC } from "@/fixtures/clinical/world";
import { describeDraftStatus } from "@/modules/clinical/status";

const PROD_FIXTURE = { FRONTEND_ADAPTER: "fixture", APP_ENV: "production", FEATURE_CLINICAL: "true" };
const FIXTURE_ON = { FRONTEND_ADAPTER: "fixture", FEATURE_CLINICAL: "true" };
const ID = "00000000-0000-4000-8000-000000000201";
const TOKEN = { getAccessToken: () => "test-token" };
const DOCTOR_CTX = { fixtureActor: { role: "doctor" as const, doctorId: "00000000-0000-4000-8000-0000000000d1" } };

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("clinical gate", () => {
  it("is off by default and only exact 'true' enables it", () => {
    expect(clinicalGate({})).toEqual({ ok: false, error: { code: "gated" } });
    expect(isClinicalEnabled({ FEATURE_CLINICAL: "1" })).toBe(false);
    expect(isClinicalEnabled({ FEATURE_CLINICAL: "true" })).toBe(true);
  });

  it("every clinical method returns gated when the flag is off (both adapters)", async () => {
    for (const env of [{}, { FRONTEND_ADAPTER: "fixture" }]) {
      const api = getClinicalApi(env);
      expect(await api.getDraft(ID)).toEqual({ ok: false, error: { code: "gated" } });
      expect(await api.saveDraft(ID, { expectedVersion: 1, content: emptyDraftContent() })).toEqual({ ok: false, error: { code: "gated" } });
      expect(await api.finalize(ID, { expectedVersion: 1, acknowledged: true }, "k")).toEqual({ ok: false, error: { code: "gated" } });
      expect(await api.requestPdfLink(ID)).toEqual({ ok: false, error: { code: "gated" } });
    }
  });

  it("records: clinical methods gated, pay-after collection is not", async () => {
    const api = getRecordsApi({ FRONTEND_ADAPTER: "fixture" }, DOCTOR_CTX);
    expect(await api.listMyRecords()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.verifyProof("a".repeat(32))).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.registerPhotoUpload(ID, { contentType: "image/png", sizeBytes: 1 })).toEqual({ ok: false, error: { code: "gated" } });
    const col = await api.getCollection("00000000-0000-4000-8000-000000000106");
    expect(col.ok).toBe(true);
  });

  it("enabled fixture getter works end to end", async () => {
    const r = await getClinicalApi(FIXTURE_ON, DOCTOR_CTX).getDraft(ID);
    expect(r.ok).toBe(true);
    // No fixture session mapped => deny everything (no default doctor/patient).
    expect(await getClinicalApi(FIXTURE_ON).getDraft(ID)).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

describe("fixture adapter refused in production", () => {
  it("throws for every module getter", () => {
    expect(() => getClinicalApi(PROD_FIXTURE)).toThrow();
    expect(() => getDoctorApi(PROD_FIXTURE)).toThrow();
    expect(() => getRecordsApi(PROD_FIXTURE)).toThrow();
  });

  it("fixtures are flagged synthetic", () => {
    expect(SYNTHETIC).toBe(true);
    expect(createClinicalWorld().synthetic).toBe(true);
  });
});

describe("http adapters", () => {
  it("rejects signed histories whose last version is not currentVersion (CR)", async () => {
    const content = emptyDraftContent();
    const signer = { clinicianId: "d", displayName: "Dr. Fixture", registrationLabel: null };
    const v = (version: number) => ({ version, signedAt: "2026-11-20T04:30:00.000Z", signedBy: signer, content });
    const base = { consultationId: ID, bookingId: ID, bookingReference: "SYN-BKG-1", status: "final", amendments: [] };
    const api = (body: unknown) => createClinicalHttpApi({ ...TOKEN, fetchImpl: async () => jsonResponse(200, body) });
    expect(await api({ ...base, currentVersion: 2, versions: [v(2), v(1)] }).getConsultation(ID)).toEqual({ ok: false, error: { code: "unavailable" } });
    expect(await api({ ...base, currentVersion: 3, versions: [v(1), v(2)] }).getConsultation(ID)).toEqual({ ok: false, error: { code: "unavailable" } });
    const good = await api({ ...base, currentVersion: 2, versions: [v(1), v(2)] }).getConsultation(ID);
    expect(good.ok && good.data.status === "final" && good.data.currentVersion).toBe(2);
  });
  it("doctor accept posts the B01 body and parses { version }", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { version: 4 }));
    const api = createDoctorHttpApi({ ...TOKEN, fetchImpl });
    const r = await api.accept(ID, { expectedVersion: 3, resourceIds: ["00000000-0000-4000-8000-0000000000e1"] });
    expect(r).toEqual({ ok: true, data: { version: 4 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/bookings/${ID}/accept`);
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({ expectedVersion: 3, resourceIds: ["00000000-0000-4000-8000-0000000000e1"] });
  });

  it("maps HTTP errors to stable codes and never trusts unexpected bodies", async () => {
    const conflict = createDoctorHttpApi({ ...TOKEN, fetchImpl: async () => jsonResponse(409, { error: { code: "conflict" } }) });
    expect(await conflict.enRoute(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "conflict" } });
    const limited = createDoctorHttpApi({ ...TOKEN, fetchImpl: async () => jsonResponse(429, {}, { "Retry-After": "12" }) });
    expect(await limited.arrive(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "rate_limited", retryAfterSeconds: 12 } });
    const weird = createDoctorHttpApi({ ...TOKEN, fetchImpl: async () => jsonResponse(200, { version: "4", extra: true }) });
    expect(await weird.arrive(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "unavailable" } });
    const down = createDoctorHttpApi({ ...TOKEN, fetchImpl: async () => { throw new Error("offline"); } });
    expect(await down.arrive(ID, { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "unavailable" } });
  });

  it("refuses non-ID path input and uncontracted endpoints are gated", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const doctor = createDoctorHttpApi({ ...TOKEN, fetchImpl });
    expect(await doctor.enRoute("../admin", { expectedVersion: 1 })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await doctor.verifyArrival(ID, { challengeId: "c", code: "123456" })).toEqual({ ok: false, error: { code: "gated" } });
    expect(await createClinicalHttpApi({ ...TOKEN, fetchImpl }).amend(ID, { baseVersion: 1, reason: "other", reasonText: "Synthetic reason", content: emptyDraftContent(), acknowledged: true }, "k")).toEqual({ ok: false, error: { code: "gated" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("patient record http view hides drafts even if the server returned one", async () => {
    const draft = { consultationId: ID, bookingId: ID, status: "draft", version: 2, savedAt: null, content: emptyDraftContent() };
    const api = createRecordsHttpApi({ ...TOKEN, fetchImpl: async () => jsonResponse(200, draft) });
    expect(await api.getMyRecord(ID)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("clinical saveDraft sends expectedVersion and parses the response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { version: 3, savedAt: "2026-11-20T04:30:00.000Z" }));
    const r = await createClinicalHttpApi({ ...TOKEN, fetchImpl }).saveDraft(ID, { expectedVersion: 2, content: emptyDraftContent() });
    expect(r).toEqual({ ok: true, data: { version: 3, savedAt: "2026-11-20T04:30:00.000Z" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/consultations/${ID}/draft`);
    expect(JSON.parse(String(init.body)).expectedVersion).toBe(2);
  });
});

describe("status maps", () => {
  it("unknown draft status is neutral, never success", () => {
    expect(describeDraftStatus("weird").tone).toBe("neutral");
    expect(describeDraftStatus("conflict").tone).toBe("danger");
  });
});
