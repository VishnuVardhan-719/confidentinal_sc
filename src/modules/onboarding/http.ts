import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { createJsonClient, toApiResult, validateInput, type HttpAdapterOptions } from "@/modules/auth/http-client";
import type { ProviderCategory } from "@/modules/auth/roles";
import { providerReadSchema, providerRowEnvelopeSchema, rowStatus, type ProviderRead } from "@/modules/verification/dto";
import { documentKindSchema, expectedVersionSchema, parseDocumentStatus } from "@/modules/verification/schemas";
import { providerStatusFromServer } from "@/modules/verification/status";
import { createProviderSchema, registerDocumentSchema, selfPatientConsentSchema, type OnboardingApi } from "./api";
import { patientQuestionnaireSchema } from "./patient";
import { isServerManagedSection, providerSectionSchema, type EvidenceView, type ProviderOnboardingDraft } from "./provider";
import { listingSchema, type DocumentRef } from "./shared";

/**
 * HTTP adapter. Endpoint sources:
 * - API_CONTRACTS.md: `POST /api/onboarding/patient`
 * - I01: `POST /api/auth/patient`
 * - I02: `POST /api/providers`, `GET|PATCH /api/providers/:id`, `POST /api/providers/:id/submit`,
 *        `POST /api/providers/:id/documents`
 * Gated (no contract; see docs/frontend/REQUESTS.md): patient draft read/save, provider
 * category sections other than `listing`.
 */

const uuid = z.uuid();

const documentTicketSchema = z.object({
  document: z.object({
    id: z.uuid(),
    kind: documentKindSchema,
    status: z.string(),
    expires_at: z.string(),
    object_name: z.string().min(1).max(200),
    content_type: z.string(),
  }),
  upload: z.object({ bucket: z.string().min(1), upsert: z.literal(false), maxBytes: z.int().positive() }),
  providerVersion: z.int().positive(),
});

function draftFromRead(p: ProviderRead): ProviderOnboardingDraft {
  const live = (p.documents ?? []).filter((d) => d.status === "pending" || d.status === "verified");
  const refs: DocumentRef[] = [];
  const evidence: EvidenceView[] = [];
  for (const d of p.documents ?? []) {
    const kind = documentKindSchema.safeParse(d.kind);
    if (!kind.success) continue;
    evidence.push({ documentId: d.id, kind: kind.data, status: parseDocumentStatus(d.status), expiresAt: d.expires_at });
    if (live.includes(d)) refs.push({ kind: kind.data, documentId: d.id });
  }
  const sections: Record<string, unknown> = {};
  if (p.profile) sections.listing = { displayName: p.profile.display_name, description: p.profile.description };
  if (refs.length > 0) sections.documents = { documents: refs };
  return {
    category: p.category,
    providerId: p.id,
    status: providerStatusFromServer({ verificationState: p.verification_state, operationalStatus: p.status }),
    version: p.version,
    updatedAt: null,
    sections,
    evidence,
  } as ProviderOnboardingDraft;
}

export function createHttpOnboardingApi(options: HttpAdapterOptions = {}): OnboardingApi {
  const client = createJsonClient(options);

  return {
    async createSelfPatient(input) {
      const valid = validateInput(selfPatientConsentSchema, input);
      if (!valid.ok) return valid.result;
      const result = await client.request({
        method: "POST",
        path: "/api/auth/patient",
        body: { policyVersion: valid.data.policyVersion, consent: true },
        schema: z.object({ patientId: z.uuid() }),
      });
      return result.ok ? ok({ patientId: result.data.patientId }) : toApiResult(result);
    },

    async getPatientDraft() {
      return fail("gated");
    },

    async savePatientSection() {
      return fail("gated");
    },

    async submitPatientQuestionnaire(input) {
      const valid = validateInput(patientQuestionnaireSchema, input);
      if (!valid.ok) return valid.result;
      const result = await client.request({
        method: "POST",
        path: "/api/onboarding/patient",
        body: valid.data,
        schema: z.unknown(),
      });
      return result.ok ? ok({ status: "submitted" }) : toApiResult(result);
    },

    async createProvider(input) {
      const valid = validateInput(createProviderSchema, input);
      if (!valid.ok) return valid.result;
      const body: Record<string, unknown> = {
        category: valid.data.category,
        displayName: valid.data.displayName,
        description: valid.data.description,
      };
      if (valid.data.organizationId) body.organizationId = valid.data.organizationId;
      const result = await client.request({
        method: "POST",
        path: "/api/providers",
        body,
        schema: z.object({ providerId: z.uuid() }),
      });
      return result.ok ? ok({ providerId: result.data.providerId }) : toApiResult(result);
    },

    async getProviderDraft(providerId) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const result = await client.request({ method: "GET", path: `/api/providers/${id.data}`, schema: providerReadSchema });
      return result.ok ? ok(draftFromRead(result.data.provider)) : toApiResult(result);
    },

    async saveProviderSection(providerId, category: ProviderCategory, sectionId, value, expectedVersion) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const version = validateInput(expectedVersionSchema, expectedVersion);
      if (!version.ok) return version.result;
      const schema = providerSectionSchema(category, sectionId);
      if (!schema) return fail("validation", { fields: { sectionId: "unknown_section" } });
      if (isServerManagedSection(sectionId)) return fail("validation", { fields: { sectionId: "server_managed" } });
      const valid = validateInput(schema, value);
      if (!valid.ok) return valid.result;
      if (sectionId !== "listing") return fail("gated");
      const listing = listingSchema.parse(valid.data);
      const result = await client.request({
        method: "PATCH",
        path: `/api/providers/${id.data}`,
        body: { displayName: listing.displayName, description: listing.description, expectedVersion: version.data },
        schema: providerRowEnvelopeSchema,
      });
      if (!result.ok) return toApiResult(result);
      const row = result.data.provider;
      return ok({ providerId: row.id, status: rowStatus(row), version: row.version });
    },

    async registerProviderDocument(providerId, input) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const valid = validateInput(registerDocumentSchema, input);
      if (!valid.ok) return valid.result;
      const result = await client.request({
        method: "POST",
        path: `/api/providers/${id.data}/documents`,
        body: valid.data,
        schema: documentTicketSchema,
      });
      if (!result.ok) return toApiResult(result);
      const { document, upload, providerVersion } = result.data;
      return ok({
        documentId: document.id,
        kind: document.kind,
        status: parseDocumentStatus(document.status),
        expiresAt: document.expires_at,
        providerVersion,
        upload: {
          bucket: upload.bucket,
          objectPath: document.object_name,
          maxBytes: upload.maxBytes,
          contentType: document.content_type,
          upsert: false,
        },
      });
    },

    async submitProvider(providerId, expectedVersion) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const version = validateInput(expectedVersionSchema, expectedVersion);
      if (!version.ok) return version.result;
      const result = await client.request({
        method: "POST",
        path: `/api/providers/${id.data}/submit`,
        body: { expectedVersion: version.data },
        schema: providerRowEnvelopeSchema,
      });
      if (!result.ok) return toApiResult(result);
      const row = result.data.provider;
      return ok({ providerId: row.id, status: rowStatus(row), version: row.version });
    },
  };
}
