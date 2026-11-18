import { z } from "zod";
import type { ApiResult } from "@/lib/api/result";
import { providerCategorySchema, type ProviderCategory } from "@/modules/auth/roles";
import {
  documentContentTypeSchema,
  documentKindSchema,
  expectedVersionSchema,
  type DocumentKind,
  type DocumentStatus,
} from "@/modules/verification/schemas";
import type { ProviderStatusDisplay } from "@/modules/verification/status";
import { consentSectionSchema, type PatientDraft, type PatientQuestionnaire, type PatientSections, type PatientStepId } from "./patient";
import type { ProviderOnboardingDraft } from "./provider";

export const createProviderSchema = z.strictObject({
  category: providerCategorySchema,
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  /** Organization-owned provider; caller needs an active `provider:manage` membership (server-checked). */
  organizationId: z.uuid().optional(),
});
export type CreateProviderInput = z.input<typeof createProviderSchema>;

/** Register private evidence metadata before uploading bytes (I02 documentSchema, no filename). */
export const registerDocumentSchema = z.strictObject({
  kind: documentKindSchema,
  contentType: documentContentTypeSchema,
  expiresAt: z.iso
    .datetime({ offset: true })
    .refine((v) => Date.parse(v) > Date.now(), { message: "expiry_in_past" }),
  expectedVersion: expectedVersionSchema,
});
export type RegisterDocumentInput = z.infer<typeof registerDocumentSchema>;

export const selfPatientConsentSchema = consentSectionSchema;
export type SelfPatientConsent = z.infer<typeof selfPatientConsentSchema>;

/** Where to upload bytes for a registered document. Private bucket; RLS-checked by Storage. */
export type DocumentUploadTicket = {
  documentId: string;
  kind: DocumentKind;
  status: DocumentStatus;
  expiresAt: string;
  providerVersion: number;
  upload: { bucket: string; objectPath: string; maxBytes: number; contentType: string; upsert: false };
};

export type ProviderMutationResult = { providerId: string; status: ProviderStatusDisplay; version: number };

export interface OnboardingApi {
  /* ----- patient ----- */
  /** I01 `POST /api/auth/patient`: create own patient record with versioned access consent. */
  createSelfPatient(input: SelfPatientConsent): Promise<ApiResult<{ patientId: string }>>;
  /** Server-saved questionnaire draft. No contract yet (HTTP: gated). */
  getPatientDraft(): Promise<ApiResult<PatientDraft>>;
  /** Save one section. No contract yet (HTTP: gated). */
  savePatientSection<K extends PatientStepId>(
    section: K,
    value: PatientSections[K],
    expectedVersion: number,
  ): Promise<ApiResult<PatientDraft>>;
  /** API_CONTRACTS `POST /api/onboarding/patient`. Body is a frontend proposal pending backend agreement. */
  submitPatientQuestionnaire(input: PatientQuestionnaire): Promise<ApiResult<{ status: "submitted" }>>;

  /* ----- providers ----- */
  createProvider(input: CreateProviderInput): Promise<ApiResult<{ providerId: string }>>;
  getProviderDraft(providerId: string): Promise<ApiResult<ProviderOnboardingDraft>>;
  /** Only `listing` has an I02 contract; other sections return gated over HTTP. */
  saveProviderSection(
    providerId: string,
    category: ProviderCategory,
    sectionId: string,
    value: unknown,
    expectedVersion: number,
  ): Promise<ApiResult<ProviderMutationResult>>;
  registerProviderDocument(providerId: string, input: RegisterDocumentInput): Promise<ApiResult<DocumentUploadTicket>>;
  submitProvider(providerId: string, expectedVersion: number): Promise<ApiResult<ProviderMutationResult>>;
}
