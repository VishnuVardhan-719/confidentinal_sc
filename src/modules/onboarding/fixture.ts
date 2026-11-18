import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { FIXTURE_IDS, FIXTURE_PATIENT_DRAFT_COMPLETE, FIXTURE_PATIENT_DRAFT_NEW, FIXTURE_PROVIDER_DRAFTS } from "@/fixtures/identity";
import { assertFixtureAllowed, type FixtureOptions } from "@/modules/auth/fixture-guard";
import { validateInput } from "@/modules/auth/http-client";
import { expectedVersionSchema } from "@/modules/verification/schemas";
import { canEditOnboarding, canSubmitForReview } from "@/modules/verification/status";
import { createProviderSchema, registerDocumentSchema, selfPatientConsentSchema, type OnboardingApi } from "./api";
import { patientQuestionnaireSchema, patientSectionSchemas, type PatientDraft } from "./patient";
import { providerCompletion, providerSectionSchema, type ProviderOnboardingDraft } from "./provider";
import type { DocumentRef } from "./shared";

/** Synthetic OnboardingApi. Server-saved drafts are simulated in memory only (never localStorage). */

export type OnboardingFixtureOptions = FixtureOptions & { patientDraft?: "empty" | "new" | "complete" };

const uuid = z.uuid();

const emptyPatientDraft = (): PatientDraft => ({ version: 0, updatedAt: null, sections: {} });

export function createFixtureOnboardingApi(options: OnboardingFixtureOptions = {}): OnboardingApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  let patientDraft: PatientDraft =
    options.patientDraft === "complete"
      ? structuredClone(FIXTURE_PATIENT_DRAFT_COMPLETE)
      : options.patientDraft === "new"
        ? structuredClone(FIXTURE_PATIENT_DRAFT_NEW)
        : emptyPatientDraft();
  const providers = new Map<string, ProviderOnboardingDraft>(
    FIXTURE_PROVIDER_DRAFTS.map((d) => [d.providerId ?? "", structuredClone(d)]),
  );

  const touch = (draft: { version: number; updatedAt: string | null }) => {
    draft.version += 1;
    draft.updatedAt = now().toISOString();
  };

  const mutation = (d: ProviderOnboardingDraft) =>
    ok({ providerId: d.providerId ?? "", status: d.status, version: d.version });

  return {
    async createSelfPatient(input) {
      const valid = validateInput(selfPatientConsentSchema, input);
      if (!valid.ok) return valid.result;
      return ok({ patientId: FIXTURE_IDS.patientNew });
    },

    async getPatientDraft() {
      return ok(structuredClone(patientDraft));
    },

    async savePatientSection(section, value, expectedVersion) {
      if (!Object.prototype.hasOwnProperty.call(patientSectionSchemas, section)) {
        return fail("validation", { fields: { section: "unknown_section" } });
      }
      // Account verification is server-derived; clients cannot mark it complete.
      if (section === "account") return fail("forbidden");
      const valid = validateInput(patientSectionSchemas[section], value);
      if (!valid.ok) return valid.result;
      if (expectedVersion !== patientDraft.version) return fail("conflict");
      patientDraft = { ...patientDraft, sections: { ...patientDraft.sections, [section]: valid.data } };
      touch(patientDraft);
      return ok(structuredClone(patientDraft));
    },

    async submitPatientQuestionnaire(input) {
      const valid = validateInput(patientQuestionnaireSchema, input);
      if (!valid.ok) return valid.result;
      return ok({ status: "submitted" });
    },

    async createProvider(input) {
      const valid = validateInput(createProviderSchema, input);
      if (!valid.ok) return valid.result;
      const providerId = crypto.randomUUID();
      providers.set(providerId, {
        category: valid.data.category,
        providerId,
        status: "draft",
        version: 1,
        updatedAt: now().toISOString(),
        sections: { listing: { displayName: valid.data.displayName, description: valid.data.description } },
      });
      return ok({ providerId });
    },

    async getProviderDraft(providerId) {
      const draft = providers.get(providerId);
      return draft ? ok(structuredClone(draft)) : fail("not_found");
    },

    async saveProviderSection(providerId, category, sectionId, value, expectedVersion) {
      const id = validateInput(uuid, providerId);
      if (!id.ok) return id.result;
      const version = validateInput(expectedVersionSchema, expectedVersion);
      if (!version.ok) return version.result;
      const draft = providers.get(id.data);
      if (!draft) return fail("not_found");
      if (draft.category !== category) return fail("validation", { fields: { category: "category_mismatch" } });
      const schema = providerSectionSchema(category, sectionId);
      if (!schema) return fail("validation", { fields: { sectionId: "unknown_section" } });
      const valid = validateInput(schema, value);
      if (!valid.ok) return valid.result;
      if (!canEditOnboarding(draft.status)) return fail("forbidden");
      if (draft.version !== version.data) return fail("conflict");
      draft.sections = { ...draft.sections, [sectionId]: valid.data };
      touch(draft);
      return mutation(draft);
    },

    async registerProviderDocument(providerId, input) {
      const valid = validateInput(registerDocumentSchema, input);
      if (!valid.ok) return valid.result;
      const draft = providers.get(providerId);
      if (!draft) return fail("not_found");
      if (!canEditOnboarding(draft.status)) return fail("forbidden");
      if (draft.version !== valid.data.expectedVersion) return fail("conflict");
      const documentId = crypto.randomUUID();
      const sections = draft.sections as { documents?: { documents: DocumentRef[] } };
      // A new registration supersedes a pending document of the same kind (I02 behaviour).
      const existing = (sections.documents?.documents ?? []).filter((d) => d.kind !== valid.data.kind);
      sections.documents = { documents: [...existing, { kind: valid.data.kind, documentId }] };
      touch(draft);
      const extension = valid.data.contentType === "application/pdf" ? "pdf" : valid.data.contentType === "image/jpeg" ? "jpg" : "png";
      return ok({
        documentId,
        kind: valid.data.kind,
        status: "pending",
        expiresAt: valid.data.expiresAt,
        providerVersion: draft.version,
        upload: {
          // Fixture mode never uploads bytes anywhere.
          bucket: "fixture-no-upload",
          objectPath: `${providerId}/${documentId}.${extension}`,
          maxBytes: 10_485_760,
          contentType: valid.data.contentType,
          upsert: false,
        },
      });
    },

    async submitProvider(providerId, expectedVersion) {
      const draft = providers.get(providerId);
      if (!draft) return fail("not_found");
      if (!canSubmitForReview(draft.status)) return fail("forbidden");
      if (draft.version !== expectedVersion) return fail("conflict");
      const completion = providerCompletion(draft.category, draft.sections);
      if (!completion.readyToSubmit) {
        return fail("validation", { fields: Object.fromEntries(completion.missingRequired.map((s) => [s, "required"])) });
      }
      draft.status = "submitted";
      touch(draft);
      return mutation(draft);
    },
  };
}
