"use server";

import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import { createAmbulanceRequestsApi, type AmbulanceRequestsApi } from "@/modules/ambulance-requests/api";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import type { RequestSlot } from "@/modules/service-requests/core";
import { servicePatientApi } from "@/modules/service-requests/server";

/**
 * Server actions for patient scheduled ambulance transfers (never emergency dispatch). Each re-checks the patient session and builds request-scoped APIs.
 * Inputs are untrusted and validated by the module adapter; the price, status and reference come from the server.
 */
async function guarded<T>(run: (api: AmbulanceRequestsApi) => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  if (getPatientSession().status !== "ok") return fail("unauthenticated");
  try { return await run(createAmbulanceRequestsApi({ patient: servicePatientApi() })); } catch { return fail("unavailable"); }
}

export async function ambulanceSlotsAction(providerId: unknown): Promise<ApiResult<{ items: RequestSlot[] }>> {
  if (!z.uuid().safeParse(providerId).success) return fail("validation");
  return guarded(api => api.slots(providerId as string));
}

export async function createAmbulanceRequestAction(input: unknown, idempotencyKey: unknown): Promise<ApiResult<{ id: string }>> {
  if (!z.uuid().safeParse(idempotencyKey).success) return fail("validation");
  return guarded(api => api.create(input, idempotencyKey as string));
}

export async function cancelAmbulanceRequestAction(id: unknown, expectedVersion: unknown): Promise<ApiResult<{ version: number }>> {
  if (!z.uuid().safeParse(id).success) return fail("validation");
  return guarded(api => api.cancel(id as string, { expectedVersion }));
}
