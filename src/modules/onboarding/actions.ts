"use server";

import { redirect } from "next/navigation";
import { authorizeRole, getRequestApis } from "@/modules/auth/server";
import { isLocale, providerCategorySchema, type Locale, type Role } from "@/modules/auth/roles";
import {
  runCreateProvider,
  runRegisterDocument,
  runSavePatientSection,
  runSaveProfile,
  runSaveProviderSection,
  runSubmitPatientQuestionnaire,
  runSubmitProvider,
  type CreateProviderState,
  type DocumentState,
  type SubmitState,
} from "./flows";
import type { SaveState } from "./wizard";

/**
 * Onboarding server actions. Each one re-authorizes the caller for the role's onboarding
 * route (never trusting the page that rendered the form), then runs the tested core.
 * Client islands call these with plain JSON payloads via useActionState.
 */

type WithLocale = { locale?: unknown };

const localeOf = (payload: unknown): Locale => {
  const value = (payload as WithLocale | null)?.locale;
  return isLocale(value) ? value : "en";
};

const roleOf = (payload: unknown): Role | null => {
  const parsed = providerCategorySchema.safeParse((payload as { category?: unknown } | null)?.category);
  return parsed.success ? parsed.data : null;
};

/** Strip routing-only keys before strict payload validation in the flow core. */
function body(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  const rest: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  delete rest.locale;
  return rest;
}

async function authorized(role: Role, locale: Locale) {
  const outcome = await authorizeRole(role, { locale, path: `/${locale}/${role}/onboarding` });
  return outcome.kind === "allowed" ? outcome : null;
}

const go = <T extends { status: string }>(state: T): T => {
  if (state.status === "redirect" && "to" in state && typeof state.to === "string") redirect(state.to);
  return state;
};

export async function savePatientSectionAction(_prev: SaveState, payload: unknown): Promise<SaveState> {
  const locale = localeOf(payload);
  if (!(await authorized("patient", locale))) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runSavePatientSection(onboarding, body(payload), locale));
}

export async function saveProfileAction(_prev: SaveState, payload: unknown): Promise<SaveState> {
  const locale = localeOf(payload);
  const outcome = await authorizeRole("patient", { locale, path: `/${locale}/patient/health-profile` });
  if (outcome.kind !== "allowed") return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runSaveProfile(onboarding, body(payload), locale));
}

export async function submitPatientQuestionnaireAction(_prev: SubmitState, payload: unknown): Promise<SubmitState> {
  const locale = localeOf(payload);
  if (!(await authorized("patient", locale))) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runSubmitPatientQuestionnaire(onboarding, locale));
}

export async function createProviderAction(_prev: CreateProviderState, payload: unknown): Promise<CreateProviderState> {
  const locale = localeOf(payload);
  const role = roleOf(payload);
  const access = role ? await authorized(role, locale) : null;
  if (!access) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runCreateProvider(onboarding, access.workspaces, body(payload), locale));
}

export async function saveProviderSectionAction(_prev: SaveState, payload: unknown): Promise<SaveState> {
  const locale = localeOf(payload);
  const role = roleOf(payload);
  if (!role || !(await authorized(role, locale))) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runSaveProviderSection(onboarding, body(payload), locale));
}

export async function registerDocumentAction(_prev: DocumentState, payload: unknown): Promise<DocumentState> {
  const locale = localeOf(payload);
  const role = roleOf(payload);
  if (!role || !(await authorized(role, locale))) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  const rest = body(payload) as Record<string, unknown> | null;
  return runRegisterDocument(onboarding, rest ? { providerId: rest.providerId, input: rest.input } : rest);
}

export async function submitProviderAction(_prev: SubmitState, payload: unknown): Promise<SubmitState> {
  const locale = localeOf(payload);
  const role = roleOf(payload);
  if (!role || !(await authorized(role, locale))) return { status: "error", errorKey: "errors.forbidden" };
  const { onboarding } = await getRequestApis();
  return go(await runSubmitProvider(onboarding, body(payload), locale));
}
