"use server";

import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import { createLabOrdersApi, type LabOrdersApi } from "@/modules/lab-orders/api";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import type { RequestSlot } from "@/modules/service-requests/core";
import { servicePatientApi } from "@/modules/service-requests/server";

/**
 * Server actions for patient lab orders. Each re-checks the patient session and builds request-scoped APIs.
 * Inputs are untrusted and validated by the module adapter; the price, status and reference come from the server.
 */
async function guarded<T>(run: (api: LabOrdersApi) => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  if ((await getPatientSession()).status !== "ok") return fail("unauthenticated");
  try { return await run(createLabOrdersApi({ patient: servicePatientApi() })); } catch { return fail("unavailable"); }
}

export async function labSlotsAction(providerId: unknown): Promise<ApiResult<{ items: RequestSlot[] }>> {
  if (!z.uuid().safeParse(providerId).success) return fail("validation");
  return guarded(api => api.slots(providerId as string));
}

export async function createLabOrderAction(input: unknown, idempotencyKey: unknown): Promise<ApiResult<{ id: string }>> {
  if (!z.uuid().safeParse(idempotencyKey).success) return fail("validation");
  return guarded(api => api.create(input, idempotencyKey as string));
}

export async function cancelLabOrderAction(id: unknown, expectedVersion: unknown): Promise<ApiResult<{ version: number }>> {
  if (!z.uuid().safeParse(id).success) return fail("validation");
  return guarded(api => api.cancel(id as string, { expectedVersion }));
}
