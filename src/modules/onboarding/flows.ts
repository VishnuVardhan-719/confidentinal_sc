import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import { errorKey, fieldMessageKeys } from "@/modules/auth/errors";
import { homePath } from "@/modules/auth/routes";
import { providerCategorySchema, type Locale, type ProviderCategory } from "@/modules/auth/roles";
import type { Workspace } from "@/modules/auth/types";
import { expectedVersionSchema } from "@/modules/verification/schemas";
import type { DocumentUploadTicket, OnboardingApi } from "./api";
import { PATIENT_STEPS, patientSectionSchemas, questionnaireFromDraft, type PatientStepId } from "./patient";
import { PROVIDER_STEPS } from "./provider";
import { patientOnboardingBase, providerIdFor, providerOnboardingBase } from "./loaders";
import { saveStateFrom, stepHref, type SaveState } from "./wizard";

/**
 * Onboarding mutation cores used by onboarding/actions.ts. Inputs arrive from client
 * islands, so every field is re-validated here before the module API validates again.
 */

const nextStepOf = (ids: readonly string[], current: string): string | null => {
  const i = ids.indexOf(current);
  return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
};

/* ---------------- patient ---------------- */

const patientSaveSchema = z.strictObject({
  section: z.enum(Object.keys(patientSectionSchemas) as [PatientStepId, ...PatientStepId[]]),
  value: z.unknown(),
  expectedVersion: z.int().nonnegative(),
  advance: z.boolean(),
});

export async function runSavePatientSection(api: OnboardingApi, payload: unknown, locale: Locale): Promise<SaveState> {
  const parsed = patientSaveSchema.safeParse(payload);
  if (!parsed.success) return saveStateFrom(fail("validation", { fields: { section: "invalid" } }), null);
  const { section, value, expectedVersion, advance } = parsed.data;
  const result = await api.savePatientSection(section, value as never, expectedVersion);
  const next = advance ? nextStepOf(PATIENT_STEPS.map((s) => s.id), section) : null;
  return saveStateFrom(result, next ? stepHref(patientOnboardingBase(locale), next) : null);
}

export type SubmitState =
  | { status: "idle" }
  | { status: "incomplete"; missing: string[] }
  | { status: "error"; errorKey: string; fieldErrors?: Record<string, string> }
  | { status: "gated" }
  | { status: "redirect"; to: string };

export const SUBMIT_IDLE: SubmitState = { status: "idle" };

const submitFailure = (result: ApiResult<never>): SubmitState => {
  if (result.ok) return { status: "idle" };
  if (result.error.code === "gated") return { status: "gated" };
  return { status: "error", errorKey: errorKey(result.error), fieldErrors: fieldMessageKeys(result.error.fields) };
};

/** Submit the server-saved draft. The payload is rebuilt from the SERVER draft, not the client. */
export async function runSubmitPatientQuestionnaire(api: OnboardingApi, locale: Locale): Promise<SubmitState> {
  const draft = await api.getPatientDraft();
  if (!draft.ok) return submitFailure(draft);
  const payload = questionnaireFromDraft(draft.data);
  if (!payload) {
    const missing = PATIENT_STEPS.map((s) => s.id).filter((id) => {
      const schema = patientSectionSchemas[id];
      return !schema.safeParse(draft.data.sections[id]).success;
    });
    return { status: "incomplete", missing };
  }
  // I01: create own patient record + versioned access consent. Existing record (409) is fine.
  const self = await api.createSelfPatient(payload.consent);
  if (!self.ok && self.error.code !== "conflict") return submitFailure(self);
  const submitted = await api.submitPatientQuestionnaire(payload);
  if (!submitted.ok) return submitFailure(submitted);
  return { status: "redirect", to: homePath("patient", locale) };
}

/* ---------------- providers ---------------- */

export type CreateProviderState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "error"; errorKey: string }
  | { status: "redirect"; to: string };

export const CREATE_IDLE: CreateProviderState = { status: "idle" };

const createPayloadSchema = z.strictObject({
  category: providerCategorySchema,
  displayName: z.string(),
  description: z.string().optional(),
});

export async function runCreateProvider(
  api: OnboardingApi,
  workspaces: readonly Workspace[],
  payload: unknown,
  locale: Locale,
): Promise<CreateProviderState> {
  const parsed = createPayloadSchema.safeParse(payload);
  if (!parsed.success) return { status: "invalid", fieldErrors: { category: "errors.fields.invalid" } };
  const { category } = parsed.data;
  const base = providerOnboardingBase(locale, category);
  // One provider per owner/category: resume instead of creating a duplicate.
  const existing = providerIdFor(workspaces, category);
  if (existing) return { status: "redirect", to: base };
  const result = await api.createProvider({
    category,
    displayName: parsed.data.displayName,
    description: parsed.data.description ?? "",
  });
  if (!result.ok) {
    if (result.error.code === "validation") return { status: "invalid", fieldErrors: fieldMessageKeys(result.error.fields) };
    return { status: "error", errorKey: errorKey(result.error) };
  }
  // The new provider may not appear in the session yet (R-FE03-03); the loader re-authorizes this ID via the API.
  return { status: "redirect", to: `${base}?provider=${result.data.providerId}` };
}

const providerSaveSchema = z.strictObject({
  category: providerCategorySchema,
  providerId: z.uuid(),
  sectionId: z.string().min(1).max(40),
  value: z.unknown(),
  expectedVersion: expectedVersionSchema,
  advance: z.boolean(),
});

const withProvider = (href: string, providerId: string) => `${href}&provider=${providerId}`;

export async function runSaveProviderSection(api: OnboardingApi, payload: unknown, locale: Locale): Promise<SaveState> {
  const parsed = providerSaveSchema.safeParse(payload);
  if (!parsed.success) return saveStateFrom(fail("validation", { fields: { sectionId: "invalid" } }), null);
  const { category, providerId, sectionId, value, expectedVersion, advance } = parsed.data;
  const result = await api.saveProviderSection(providerId, category, sectionId, value, expectedVersion);
  const ids = PROVIDER_STEPS[category].map((s) => s.id as string);
  const next = advance ? nextStepOf(ids, sectionId) : null;
  return saveStateFrom(result, next ? withProvider(stepHref(providerOnboardingBase(locale, category), next), providerId) : null);
}

export type DocumentState =
  | { status: "idle" }
  | { status: "registered"; ticket: DocumentUploadTicket }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "error"; errorKey: string };

export const DOCUMENT_IDLE: DocumentState = { status: "idle" };

const documentPayloadSchema = z.strictObject({ providerId: z.uuid(), input: z.unknown() });

export async function runRegisterDocument(api: OnboardingApi, payload: unknown): Promise<DocumentState> {
  const parsed = documentPayloadSchema.safeParse(payload);
  if (!parsed.success) return { status: "invalid", fieldErrors: { providerId: "errors.fields.invalid" } };
  const result = await api.registerProviderDocument(parsed.data.providerId, parsed.data.input as never);
  if (result.ok) return { status: "registered", ticket: result.data };
  if (result.error.code === "validation") return { status: "invalid", fieldErrors: fieldMessageKeys(result.error.fields) };
  return { status: "error", errorKey: errorKey(result.error) };
}

const submitProviderSchema = z.strictObject({
  category: providerCategorySchema,
  providerId: z.uuid(),
  expectedVersion: expectedVersionSchema,
});

export async function runSubmitProvider(api: OnboardingApi, payload: unknown, locale: Locale): Promise<SubmitState> {
  const parsed = submitProviderSchema.safeParse(payload);
  if (!parsed.success) return { status: "error", errorKey: "errors.validation" };
  const { category, providerId, expectedVersion } = parsed.data;
  const result = await api.submitProvider(providerId, expectedVersion);
  if (!result.ok) {
    if (result.error.code === "validation" && result.error.fields) {
      return { status: "incomplete", missing: Object.keys(result.error.fields) };
    }
    return submitFailure(result);
  }
  return { status: "redirect", to: `${providerOnboardingBase(locale, category as ProviderCategory)}?provider=${providerId}` };
}
