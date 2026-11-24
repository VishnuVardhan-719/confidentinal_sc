import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { FIXTURE_IDS, FIXTURE_PATIENT_DRAFT_COMPLETE, FIXTURE_PATIENT_DRAFT_NEW, FIXTURE_PROVIDER_DRAFTS } from "@/fixtures/identity";
import { assertFixtureAllowed, type FixtureOptions } from "@/modules/auth/fixture-guard";
import { validateInput } from "@/modules/auth/http-client";
import { expectedVersionSchema } from "@/modules/verification/schemas";
import { canEditOnboarding, canSubmitForReview } from "@/modules/verification/status";
import { createProviderSchema, registerDocumentSchemaAt, selfPatientConsentSchema, type OnboardingApi } from "./api";
import { patientQuestionnaireSchema, patientSectionSchemas, type PatientDraft } from "./patient";
import { isServerManagedSection, providerCompletion, providerSectionSchema, type ProviderOnboardingDraft } from "./provider";
import type { DocumentRef } from "./shared";
import { fixtureRegisterSubmission, fixtureReviewStatus } from "@/modules/verification/fixture";
import type { ProviderCategory } from "@/modules/auth/roles";

/** Synthetic OnboardingApi. Server-saved drafts are simulated in memory only (never localStorage). */

type PatientSeed = "empty" | "new" | "complete";

export type FixtureOnboardingStore = {
  patientDrafts: Map<string, PatientDraft>;
  providers: Map<string, ProviderOnboardingDraft>;
  /** Document IDs actually registered per provider (the only way evidence enters a draft). */
  registeredDocuments: Map<string, Set<string>>;
};

export type OnboardingFixtureOptions = FixtureOptions & {
  /** Synthetic user whose patient draft is read/written. */
  actorId?: string;
  store?: FixtureOnboardingStore;
  /** Shortcut for tests: isolated store whose actor starts with this draft. */
  patientDraft?: PatientSeed;
};

const uuid = z.uuid();
const ANONYMOUS_ACTOR = "fixture-anonymous";

/** Fixture actors are signed-in synthetic users, so the server-derived account step is verified. */
const emptyPatientDraft = (): PatientDraft => ({ version: 0, updatedAt: null, sections: { account: { contactVerified: true } } });
const seedDraft = (seed: PatientSeed): PatientDraft =>
  seed === "complete"
    ? structuredClone(FIXTURE_PATIENT_DRAFT_COMPLETE)
    : seed === "new"
      ? structuredClone(FIXTURE_PATIENT_DRAFT_NEW)
      : emptyPatientDraft();

export function createFixtureOnboardingStore(seeds: Record<string, PatientSeed> = {}): FixtureOnboardingStore {
  return {
    patientDrafts: new Map(Object.entries(seeds).map(([actor, seed]) => [actor, seedDraft(seed)])),
    providers: new Map(FIXTURE_PROVIDER_DRAFTS.map((d) => [d.providerId ?? "", structuredClone(d)])),
    registeredDocuments: new Map(),
  };
}

/** Dev-server process memory so "server-saved" drafts survive reloads in fixture mode. */
let sharedStore: FixtureOnboardingStore | null = null;
const getSharedStore = (): FixtureOnboardingStore =>
  (sharedStore ??= createFixtureOnboardingStore({
    [FIXTURE_IDS.patientNew]: "new",
    [FIXTURE_IDS.patientComplete]: "complete",
    [FIXTURE_IDS.doctorDraftUser]: "empty",
  }));

/** A brand-new signup starts with an empty questionnaire (the demo draft is only for the sample sign-in account). */
export const resetFixturePatientDraft = (actorId: string): void => {
  getSharedStore().patientDrafts.set(actorId, emptyPatientDraft());
  submittedPatients.delete(actorId);
};

/** Fixture patients who finished the questionnaire; their workspace becomes active (no more "fill in your details"). */
const submittedPatients = new Set<string>();
export const fixturePatientSubmitted = (actorId: string): boolean => submittedPatients.has(actorId);

/** Latest application started in this process per category, for brand-new fixture provider accounts. */
const applications = new Map<ProviderCategory, string>();

/** The provider application a freshly signed-up fixture account has started, with the status the admin has since set. */
export function fixtureApplicationFor(category: ProviderCategory): { providerId: string; status: ProviderOnboardingDraft["status"] } | null {
  const providerId = applications.get(category);
  const draft = providerId ? getSharedStore().providers.get(providerId) : undefined;
  if (!providerId || !draft) return null;
  return { providerId, status: fixtureReviewStatus(providerId) ?? draft.status };
}

/** A new signup for this category starts with no application. */
export const resetFixtureApplication = (category: ProviderCategory): void => {
  applications.delete(category);
};

export function createFixtureOnboardingApi(options: OnboardingFixtureOptions = {}): OnboardingApi {
  assertFixtureAllowed(options.env);
  const now = options.now ?? (() => new Date());
  const actor = options.actorId ?? ANONYMOUS_ACTOR;
  const store =
    options.store ?? (options.patientDraft ? createFixtureOnboardingStore({ [actor]: options.patientDraft }) : getSharedStore());
  const providers = store.providers;
  const isShared = store === sharedStore;
  const readDraft = (): PatientDraft => store.patientDrafts.get(actor) ?? emptyPatientDraft();

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
      return ok(structuredClone(readDraft()));
    },

    async savePatientSection(section, value, expectedVersion) {
      if (!Object.prototype.hasOwnProperty.call(patientSectionSchemas, section)) {
        return fail("validation", { fields: { section: "unknown_section" } });
      }
      // Account verification is server-derived; clients cannot mark it complete.
      if (section === "account") return fail("forbidden");
      const valid = validateInput(patientSectionSchemas[section], value);
      if (!valid.ok) return valid.result;
      const current = readDraft();
      if (expectedVersion !== current.version) return fail("conflict");
      const next: PatientDraft = { ...current, sections: { ...current.sections, [section]: valid.data } };
      touch(next);
      store.patientDrafts.set(actor, next);
      return ok(structuredClone(next));
    },

    async submitPatientQuestionnaire(input) {
      const valid = validateInput(patientQuestionnaireSchema, input);
      if (!valid.ok) return valid.result;
      // Account verification is server-derived; the payload cannot claim it.
      if (readDraft().sections.account?.contactVerified !== true) {
        return fail("validation", { fields: { account: "contact_unverified" } });
      }
      if (store === sharedStore) submittedPatients.add(actor);
      return ok({ status: "submitted" });
    },

    async createProvider(input) {
      const valid = validateInput(createProviderSchema, input);
      if (!valid.ok) return valid.result;
      const providerId = crypto.randomUUID();
      if (isShared) applications.set(valid.data.category, providerId);
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
      if (!draft) return fail("not_found");
      // The admin's decision on a submitted application is reflected back (e.g. "changes required" reopens editing).
      const decided = isShared ? fixtureReviewStatus(providerId) : null;
      if (decided && decided !== draft.status && (draft.status === "submitted" || draft.status === "under_review")) draft.status = decided;
      return ok(structuredClone(draft));
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
      if (isServerManagedSection(sectionId)) return fail("validation", { fields: { sectionId: "server_managed" } });
      const valid = validateInput(schema, value);
      if (!valid.ok) return valid.result;
      if (!canEditOnboarding(draft.status)) return fail("forbidden");
      if (draft.version !== version.data) return fail("conflict");
      draft.sections = { ...draft.sections, [sectionId]: valid.data };
      touch(draft);
      return mutation(draft);
    },

    async registerProviderDocument(providerId, input) {
      const valid = validateInput(registerDocumentSchemaAt(now), input);
      if (!valid.ok) return valid.result;
      const draft = providers.get(providerId);
      if (!draft) return fail("not_found");
      if (!canEditOnboarding(draft.status)) return fail("forbidden");
      if (draft.version !== valid.data.expectedVersion) return fail("conflict");
      const documentId = crypto.randomUUID();
      const registered = store.registeredDocuments.get(providerId) ?? new Set<string>();
      registered.add(documentId);
      store.registeredDocuments.set(providerId, registered);
      const sections = draft.sections as { documents?: { documents: DocumentRef[] } };
      // A new registration supersedes a pending document of the same kind (I02 behaviour).
      const existing = (sections.documents?.documents ?? []).filter((d) => d.kind !== valid.data.kind);
      sections.documents = { documents: [...existing, { kind: valid.data.kind, documentId }] };
      const previous = (draft.evidence ?? []).map((e) =>
        e.kind === valid.data.kind && e.status === "pending" ? { ...e, status: "superseded" as const } : e,
      );
      draft.evidence = [...previous, { documentId, kind: valid.data.kind, status: "pending", expiresAt: valid.data.expiresAt }];
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
      const refs = (draft.sections as { documents?: { documents: DocumentRef[] } }).documents?.documents ?? [];
      const registered = store.registeredDocuments.get(providerId) ?? new Set<string>();
      if (!refs.every((d) => registered.has(d.documentId))) {
        return fail("validation", { fields: { documents: "unregistered_document" } });
      }
      draft.status = "submitted";
      touch(draft);
      if (isShared) {
        const listing = (draft.sections as { listing?: { displayName?: string; description?: string } }).listing;
        const submittedAt = now().toISOString();
        fixtureRegisterSubmission({
          providerId,
          category: draft.category,
          status: "submitted",
          version: draft.version,
          displayName: listing?.displayName ?? null,
          description: listing?.description ?? null,
          documents: (draft.evidence ?? []).map((e) => ({
            id: e.documentId,
            kind: e.kind,
            status: e.status,
            expiresAt: e.expiresAt,
            createdAt: submittedAt,
          })),
          events: [{ fromState: "draft", toState: "submitted", publicReason: "Application submitted.", providerVersion: draft.version, occurredAt: submittedAt }],
        });
      }
      return mutation(draft);
    },
  };
}
