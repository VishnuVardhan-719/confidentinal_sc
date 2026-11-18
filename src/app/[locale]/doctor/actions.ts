"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getClinicalApi } from "@/modules/clinical";
import type { AmendmentRequest, SaveDraftRequest, SignRequest } from "@/modules/clinical/schemas";
import type { Consultation, DraftSnapshot, PdfLink, SaveDraftResponse, SignedConsultation } from "@/modules/clinical/types";
import { getDoctorApi } from "@/modules/doctor";
import { parseRouteId } from "@/modules/doctor/routing";
import { getDoctorSession } from "@/modules/doctor/session";
import { DECLINE_REASONS, type ArrivalChallenge, type DeclineReason, type VerifyArrivalOutcome, type VersionResponse } from "@/modules/doctor/types";
import { getRecordsApi } from "@/modules/records";
import type { CollectionInput, CollectionView, ConfirmFactsInput, CorrectFactInput, HealthFactView, PhotoConsent, PhotoConsentInput, ProofOfVisit } from "@/modules/records/types";

/**
 * Server actions for the doctor workspace. Each call re-resolves the session and builds fresh
 * per-request APIs; inputs are untrusted and re-validated by the module adapters (Zod) and the
 * backend. Nothing here logs inputs or results (they can contain PHI).
 */
async function apis() {
  const session = await getDoctorSession();
  if (session.guard.status !== "ok") return null;
  return {
    doctor: getDoctorApi(process.env, session.ctx),
    clinical: getClinicalApi(process.env, session.ctx),
    records: getRecordsApi(process.env, session.ctx),
  };
}

const NO_SESSION = fail("unauthenticated");
const BAD_ID = fail("not_found");
const isVersion = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const isKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

export async function acceptRequestAction(bookingId: string, expectedVersion: number): Promise<ApiResult<VersionResponse>> {
  const id = parseRouteId(bookingId);
  if (!id || !isVersion(expectedVersion)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  const resources = await a.doctor.listAcceptResources();
  if (!resources.ok) return resources;
  if (resources.data.length === 0) return fail("gated");
  return a.doctor.accept(id, { expectedVersion, resourceIds: [resources.data[0].resourceId] });
}

export async function declineRequestAction(bookingId: string, expectedVersion: number, reason: DeclineReason): Promise<ApiResult<VersionResponse>> {
  const id = parseRouteId(bookingId);
  if (!id || !isVersion(expectedVersion) || !(DECLINE_REASONS as readonly string[]).includes(reason)) return fail("validation");
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.doctor.decline(id, { expectedVersion, reason });
}

export async function advanceVisitAction(bookingId: string, step: "en_route" | "arrive" | "start", expectedVersion: number): Promise<ApiResult<VersionResponse>> {
  const id = parseRouteId(bookingId);
  if (!id || !isVersion(expectedVersion)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  if (step === "en_route") return a.doctor.enRoute(id, { expectedVersion });
  if (step === "arrive") return a.doctor.arrive(id, { expectedVersion });
  if (step === "start") return a.doctor.startConsultation(id, { expectedVersion });
  return fail("validation");
}

export async function verifyArrivalAction(bookingId: string, challengeId: string, code: string): Promise<ApiResult<VerifyArrivalOutcome>> {
  const id = parseRouteId(bookingId);
  const ch = parseRouteId(challengeId);
  if (!id || !ch || typeof code !== "string") return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.doctor.verifyArrival(id, { challengeId: ch, code });
}

export async function resendArrivalCodeAction(bookingId: string): Promise<ApiResult<ArrivalChallenge>> {
  const id = parseRouteId(bookingId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.doctor.resendArrivalCode(id);
}

// ---- Clinical draft / sign (gated by FEATURE_CLINICAL inside getClinicalApi) -------------------
export async function getDraftAction(consultationId: string): Promise<ApiResult<DraftSnapshot>> {
  const id = parseRouteId(consultationId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.getDraft(id);
}

export async function saveDraftAction(consultationId: string, input: SaveDraftRequest): Promise<ApiResult<SaveDraftResponse>> {
  const id = parseRouteId(consultationId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.saveDraft(id, input);
}

export async function finalizeAction(consultationId: string, input: SignRequest, idempotencyKey: string): Promise<ApiResult<SignedConsultation>> {
  const id = parseRouteId(consultationId);
  if (!id || !isKey(idempotencyKey)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.finalize(id, input, idempotencyKey);
}

export async function amendAction(consultationId: string, input: AmendmentRequest, idempotencyKey: string): Promise<ApiResult<SignedConsultation>> {
  const id = parseRouteId(consultationId);
  if (!id || !isKey(idempotencyKey)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.amend(id, input, idempotencyKey);
}

export async function getConsultationAction(consultationId: string): Promise<ApiResult<Consultation>> {
  const id = parseRouteId(consultationId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.getConsultation(id);
}

export async function pdfLinkAction(consultationId: string): Promise<ApiResult<PdfLink>> {
  const id = parseRouteId(consultationId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.clinical.requestPdfLink(id);
}

// ---- Records: collection (ungated), facts, proof, photo (gated) ------------------------------
export async function recordCollectionAction(bookingId: string, input: CollectionInput, idempotencyKey: string): Promise<ApiResult<CollectionView>> {
  const id = parseRouteId(bookingId);
  if (!id || !isKey(idempotencyKey)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.recordCollection(id, input, idempotencyKey);
}

export async function confirmFactsAction(bookingId: string, input: ConfirmFactsInput): Promise<ApiResult<HealthFactView[]>> {
  const id = parseRouteId(bookingId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.confirmHealthFacts(id, input);
}

export async function correctFactAction(bookingId: string, input: CorrectFactInput): Promise<ApiResult<HealthFactView>> {
  const id = parseRouteId(bookingId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.correctHealthFact(id, input);
}

export async function issueProofAction(bookingId: string, idempotencyKey: string): Promise<ApiResult<ProofOfVisit>> {
  const id = parseRouteId(bookingId);
  if (!id || !isKey(idempotencyKey)) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.issueProof(id, idempotencyKey);
}

export async function revokeProofAction(bookingId: string, token: string): Promise<ApiResult<ProofOfVisit>> {
  const id = parseRouteId(bookingId);
  if (!id || typeof token !== "string") return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.revokeProof(id, token);
}

export async function photoConsentAction(consultationId: string, input: PhotoConsentInput): Promise<ApiResult<PhotoConsent>> {
  const id = parseRouteId(consultationId);
  if (!id) return BAD_ID;
  const a = await apis();
  if (!a) return NO_SESSION;
  return a.records.recordPhotoConsent(id, input);
}
