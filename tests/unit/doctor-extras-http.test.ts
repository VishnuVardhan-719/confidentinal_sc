import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), realSession: undefined as unknown, publicClient: vi.fn() }));
vi.mock("@/lib/auth/http", async original => {
  const real = await original<typeof import("@/lib/auth/http")>();
  mock.realSession = real.session;
  return { ...real, session: mock.session };
});
vi.mock("@/lib/db/request-client", async original => ({ ...await original<typeof import("@/lib/db/request-client")>(), publicAuthClient: mock.publicClient }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: async () => {} }));
import { bookingCommand } from "@/lib/booking/service";
import { DCX_PASS_THROUGH, dcxCommand } from "@/lib/doctor-extras/service";
import { RENDERER_VERSION } from "@/lib/doctor-extras/visit-report";
import * as progressRoute from "@/app/api/bookings/[id]/progress/route";
import * as visitPaymentRoute from "@/app/api/bookings/[id]/visit-payment/route";
import { GET as listFacts, POST as recordFact } from "@/app/api/patients/[id]/health-facts/route";
import { POST as reviseFact } from "@/app/api/health-facts/[id]/revise/route";
import { POST as verifyFact } from "@/app/api/health-facts/[id]/verify/route";
import { GET as listProofs, POST as issueProof } from "@/app/api/bookings/[id]/visit-proofs/route";
import { POST as revokeProof } from "@/app/api/visit-proofs/[id]/revoke/route";
import { POST as checkProof } from "@/app/api/visit-proofs/verify/route";
import { POST as grantConsent } from "@/app/api/bookings/[id]/photo-consents/route";
import { GET as listPhotos, POST as registerPhoto } from "@/app/api/bookings/[id]/photos/route";
import { POST as withdrawConsent } from "@/app/api/photo-consents/[id]/withdraw/route";
import { POST as photoTicket } from "@/app/api/visit-photos/[id]/read-ticket/route";
import { POST as report } from "@/app/api/clinical-records/[id]/report/route";

const id = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const key = "30000000-0000-4000-8000-000000000003";
const token = "A".repeat(42) + "_";
const ctx = { params: Promise.resolve({ id }) };
const url = (path = "") => `http://localhost/api/x/${id}${path}`;
const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }) =>
  new Request(url(), { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (path = "") => new Request(url(path));
type Handler = (request: Request, context: typeof ctx) => Promise<Response>;

// [name, handler, body, rpc, args, response key]
const commands: [string, Handler, unknown, string, Record<string, unknown>, string][] = [
  ["record fact", recordFact, { kind: "allergy", statement: " Penicillin rash " }, "record_health_fact",
    { p_patient_id: id, p_kind: "allergy", p_statement: "Penicillin rash", p_request_key: key }, "fact"],
  ["revise fact", reviseFact, { statement: "Penicillin hives", expectedVersion: 1 }, "revise_health_fact",
    { p_fact_id: id, p_statement: "Penicillin hives", p_expected_version: 1, p_request_key: key }, "version"],
  ["verify fact", verifyFact, { factVersion: 2, bookingId: other, outcome: "confirmed", evidenceKind: "document_reviewed", evidenceRef: "DOC-123" },
    "verify_health_fact", { p_fact_id: id, p_fact_version: 2, p_booking_id: other, p_outcome: "confirmed", p_evidence_kind: "document_reviewed",
      p_evidence_ref: "DOC-123", p_request_key: key }, "verificationId"],
  ["revoke proof", revokeProof as Handler, undefined, "revoke_visit_proof", { p_token_id: id, p_request_key: key }, "proof"],
  ["grant consent", grantConsent, { purpose: "wound_documentation", policyVersion: "photo-v1" }, "grant_photo_consent",
    { p_booking_id: id, p_purpose: "wound_documentation", p_policy_version: "photo-v1", p_request_key: key }, "consentId"],
  ["withdraw consent", withdrawConsent, { expectedVersion: 1 }, "withdraw_photo_consent",
    { p_consent_id: id, p_expected_version: 1, p_request_key: key }, "version"],
  ["register photo", registerPhoto, { consentId: other, contentType: "image/jpeg" }, "register_visit_photo",
    { p_booking_id: id, p_consent_id: other, p_content_type: "image/jpeg", p_request_key: key }, "photo"],
];
const withBody = commands.filter(c => c[2] !== undefined);

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: 6, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
  mock.publicClient.mockReset().mockReturnValue({ rpc: mock.rpc });
});

describe("DC-extras commands call one fixed RPC with exact arguments", () => {
  it.each(commands)("%s", async (_, handler, body, name, args, responseKey) => {
    const res = await handler(body === undefined ? post(undefined) : post(body), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [responseKey]: 6 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(name, args);
  });
  it.each(commands)("%s requires an Idempotency-Key", async (_, handler, body) => {
    const res = await handler(post(body ?? {}, {}), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(withBody)("%s rejects extra keys (actor, reviewer, state, source) before the RPC", async (_, handler, body) => {
    for (const extra of [{ actorId: id }, { reviewerId: id }, { state: "paid" }, { source: "clinician_recorded" }, { patientId: other }]) {
      const res = await handler(post({ ...body as object, ...extra }), ctx);
      expect(res.status).toBe(422);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("a malformed route id is 422 without an RPC", async () => {
    const res = await recordFact(post({ kind: "allergy", statement: "x" }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["fact kind", recordFact, { kind: "diagnosis", statement: "x" }],
    ["control character", recordFact, { kind: "other", statement: "a\u0007b" }],
    ["long statement", recordFact, { kind: "other", statement: "x".repeat(201) }],
    ["prose evidence", verifyFact, { factVersion: 1, bookingId: other, outcome: "confirmed", evidenceKind: "document_reviewed", evidenceRef: "seen by me" }],
    ["patient declaration as evidence", verifyFact, { factVersion: 1, bookingId: other, outcome: "confirmed", evidenceKind: "patient_statement", evidenceRef: "x" }],
    ["photo purpose", grantConsent, { purpose: "marketing", policyVersion: "v1" }],
    ["photo type", registerPhoto, { consentId: other, contentType: "image/gif" }],
  ] as [string, Handler, unknown][])("%s is rejected before the RPC", async (_, handler, body) => {
    expect((await handler(post(body), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("reads", () => {
  it("DC03 progress forwards the cursor and defaults it to 0", async () => {
    mock.rpc.mockResolvedValue({ data: { version: 7 }, error: null });
    expect(await (await progressRoute.GET(get("?afterVersion=5"), ctx)).json()).toEqual({ progress: { version: 7 } });
    expect(mock.rpc).toHaveBeenLastCalledWith("get_visit_progress", { p_booking_id: id, p_after_version: 5 });
    await progressRoute.GET(get(), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("get_visit_progress", { p_booking_id: id, p_after_version: 0 });
  });
  it.each(["?afterVersion=-1", "?afterVersion=x", "?afterVersion=1&afterVersion=2", "?since=1"])("DC03 progress rejects %s", async (q) => {
    expect((await progressRoute.GET(get(q), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("DC10 visit-payment is read only and forwards nothing but the booking id", async () => {
    expect(Object.keys(visitPaymentRoute)).toEqual(["GET"]);
    expect(Object.keys(progressRoute)).toEqual(["GET"]);
    mock.rpc.mockResolvedValue({ data: { payment: null }, error: null });
    const res = await visitPaymentRoute.GET(get("?state=paid&amountPaise=1"), ctx);
    expect(await res.json()).toEqual({ status: { payment: null } });
    expect(mock.rpc).toHaveBeenCalledWith("get_visit_payment_status", { p_booking_id: id });
  });
  it("DC11 list passes the optional booking id", async () => {
    await listFacts(get(), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("list_health_facts", { p_patient_id: id, p_booking_id: null });
    await listFacts(get(`?bookingId=${other}`), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("list_health_facts", { p_patient_id: id, p_booking_id: other });
  });
  it.each([
    ["proofs", listProofs, "list_visit_proofs", { p_booking_id: id }],
    ["photos", listPhotos, "list_visit_photos", { p_booking_id: id }],
  ] as [string, Handler, string, Record<string, unknown>][])("%s list", async (_, handler, name, args) => {
    expect((await handler(get(), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(name, args);
  });
  it("DC13 read ticket takes no body and binds the photo id", async () => {
    await photoTicket(post(undefined, {}), ctx);
    expect(mock.rpc).toHaveBeenCalledWith("authorize_visit_photo_read", { p_photo_id: id });
  });
  it.each([
    ["progress", progressRoute.GET as Handler, () => get()], ["visit-payment", visitPaymentRoute.GET as Handler, () => get()],
    ["facts", listFacts, () => get()], ["proofs", listProofs, () => get()], ["photos", listPhotos, () => get()],
    ["record fact", recordFact, () => post({ kind: "allergy", statement: "x" })], ["ticket", photoTicket, () => post(undefined)],
    ["report", report, () => post(undefined)],
  ] as [string, Handler, () => Request][])("%s returns 401 without a bearer token", async (_, handler, request) => {
    mock.session.mockImplementation(mock.realSession as typeof mock.session);
    expect((await handler(request(), ctx)).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("DC12 proofs", () => {
  it("issue returns the token once and defaults the lifetime to 7 days", async () => {
    mock.rpc.mockResolvedValue({ data: { token_id: other, token, expires_at: "2026-11-27T00:00:00Z" }, error: null });
    const res = await issueProof(post({}), ctx);
    expect(await res.json()).toEqual({ proof: { tokenId: other, token, expiresAt: "2026-11-27T00:00:00Z" } });
    expect(mock.rpc).toHaveBeenCalledWith("issue_visit_proof", { p_booking_id: id, p_ttl_hours: 168, p_request_key: key });
  });
  it("a replayed issuance without plaintext is 409 proof_already_issued", async () => {
    mock.rpc.mockResolvedValue({ data: { token_id: other, token: null, expires_at: "2026-11-27T00:00:00Z" }, error: null });
    const res = await issueProof(post({ ttlHours: 24 }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "proof_already_issued" }, tokenId: other });
  });
  it.each([0, 721, 1.5])("lifetime %s hours is rejected", async (ttlHours) => {
    expect((await issueProof(post({ ttlHours }), ctx)).status).toBe(422);
  });
  it("the guest check needs no session and returns only valid, visit date and service", async () => {
    mock.rpc.mockResolvedValue({ data: { valid: true, visit_date: "2026-11-20", service: "doctor_home_visit", patient_id: other }, error: null });
    const res = await checkProof(new Request("http://localhost/api/visit-proofs/verify", { method: "POST", body: JSON.stringify({ token }) }));
    expect(await res.json()).toEqual({ valid: true, visitDate: "2026-11-20", service: "doctor_home_visit" });
    expect(mock.session).not.toHaveBeenCalled();
    expect(mock.publicClient).toHaveBeenCalledWith();
    expect(mock.rpc).toHaveBeenCalledWith("verify_visit_proof", { p_token: token });
  });
  it("an invalid token answers only valid:false", async () => {
    mock.rpc.mockResolvedValue({ data: { valid: false }, error: null });
    const res = await checkProof(new Request("http://localhost/api/visit-proofs/verify", { method: "POST", body: JSON.stringify({ token }) }));
    expect(await res.json()).toEqual({ valid: false });
  });
  it.each(["short", "A".repeat(42) + "=", "A".repeat(44)])("malformed token %s is 422 without an RPC", async (bad) => {
    const res = await checkProof(new Request("http://localhost/api/visit-proofs/verify", { method: "POST", body: JSON.stringify({ token: bad }) }));
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

const recordDoc = {
  record_id: id, booking_id: other, booking_ref: "SCV-TEST-0001", record_version: 2, kind: "amendment",
  supersedes_record_id: other, amendment_reason: "Corrected dose", is_latest: true, signed_at: "2026-11-20T10:00:00Z",
  signer: { name: "Synthetic Doctor" }, provider: { reference: "PRV-1", name: "Synthetic Clinic" }, patient: { name: "Synthetic Patient" },
  visit: { start_at: "2026-11-20T09:00:00Z", end_at: "2026-11-20T09:30:00Z" },
  content: { assessment: { summary: "Viral fever", certainty: "provisional" } }, vital_warnings: [], content_sha256: "a".repeat(64),
};

describe("DC14 report route", () => {
  it("renders, records the PDF hash with the renderer version, then streams a private PDF", async () => {
    mock.rpc.mockResolvedValueOnce({ data: recordDoc, error: null }).mockResolvedValueOnce({ data: { render_id: other }, error: null });
    const res = await report(post(undefined), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="visit-report-SCV-TEST-0001-v2.pdf"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe("%PDF-1.4");
    expect(res.headers.get("X-Report-SHA256")).toBe(sha);
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "get_clinical_report_source", { p_record_id: id });
    expect(mock.rpc).toHaveBeenNthCalledWith(2, "record_clinical_report", { p_record_id: id, p_renderer_version: RENDERER_VERSION, p_pdf_sha256: sha, p_request_key: key });
  });
  it("fails closed when the render cannot be recorded", async () => {
    mock.rpc.mockResolvedValueOnce({ data: recordDoc, error: null }).mockResolvedValueOnce({ data: null, error: { code: "53300", message: "report_limit" } });
    const res = await report(post(undefined), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).not.toBe("application/pdf");
  });
  it("a document for another record or of the wrong shape is 503 without recording", async () => {
    for (const data of [{ ...recordDoc, record_id: other }, { ...recordDoc, content_sha256: "nope" }]) {
      mock.rpc.mockReset().mockResolvedValueOnce({ data, error: null });
      expect((await report(post(undefined), ctx)).status).toBe(503);
      expect(mock.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("an unreadable record is 404 (patient or signer only)", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "not_found" } });
    expect((await report(post(undefined), ctx)).status).toBe(404);
  });
});

describe("error mapping (contract §1 rule 5, §10.1)", () => {
  it.each(Object.entries(DCX_PASS_THROUGH))("%s passes through", async (message, status) => {
    const code = ({ 409: message === "stale_version" ? "40001" : "55000", 403: "42501", 429: "53300" } as Record<number, string>)[status];
    mock.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const res = await recordFact(post({ kind: "allergy", statement: "x" }), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code: message } });
  });
  it.each(["feature_unavailable", "feature_suspended"])("gate %s is 503 feature_unavailable", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
    const res = await progressRoute.GET(get(), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
  });
  it("a pass-through message under another SQLSTATE is not passed through", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "proof_limit" } });
    expect(await (await recordFact(post({ kind: "allergy", statement: "x" }), ctx)).json()).toEqual({ error: { code: "invalid_input" } });
  });
  it("other database text is never echoed", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "private data +919999999999" } });
    const res = await withdrawConsent(post({ expectedVersion: 1 }), ctx);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("private");
  });
  it.each(["42501", "P0002", "40001", "40P01", "23P01", "23505", "55000", "23503", "23514", "22023", "22007", "22008", "22003", "57014", "53300", "XX000"])(
    "SQLSTATE %s maps exactly like bookingCommand", async (code) => {
      const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: "invalid_transition" } }) };
      const outcome = async (run: () => Promise<unknown>) => { try { await run(); return "ok"; } catch (e) { const x = e as IdentityError; return `${x.status}:${x.code}`; } };
      expect(await outcome(() => dcxCommand(failing, "get_visit_progress", {}))).toBe(await outcome(() => bookingCommand(failing, "advance_visit", {})));
    });
  it("deadlocks are retried", async () => {
    const db = { rpc: vi.fn().mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock" } }).mockResolvedValueOnce({ data: 7, error: null }) };
    expect(await dcxCommand(db, "get_visit_progress", {})).toBe(7);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
});
