"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getSavedProvidersApi } from "@/modules/saved-providers";

/** Save/unsave a doctor. Re-resolves the session each call; the adapter re-validates ids. Nothing is logged. */
async function run<T>(fn: (api: ReturnType<typeof getSavedProvidersApi>) => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const session = getPatientSession();
  if (session.status !== "ok") return fail("unauthenticated");
  try {
    return await fn(getSavedProvidersApi(process.env, session.fixtureActor));
  } catch {
    return fail("unavailable");
  }
}

export async function saveProviderAction(providerId: string, idempotencyKey: string): Promise<ApiResult<{ saved: true }>> {
  const r = await run((api) => api.save(providerId, idempotencyKey));
  return r.ok ? { ok: true, data: { saved: true } } : r;
}

export async function unsaveProviderAction(providerId: string): Promise<ApiResult<{ saved: false }>> {
  const r = await run((api) => api.unsave(providerId));
  return r.ok ? { ok: true, data: { saved: false } } : r;
}
