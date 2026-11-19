"use server";

import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import { checkReschedule, rescheduleRequestSchema } from "@/components/patient/reschedule-request";
import { dashboardBookingsApi, getPatientSession } from "@/modules/patient-dashboard/session";

/**
 * Patient booking mutations. Every call re-resolves the interim patient session and builds a fresh
 * per-request API. Inputs are untrusted: ids and versions are re-validated here and again by the
 * module adapter and the backend, which owns ownership, state and cancellation-policy checks.
 * Nothing is logged.
 */
const idSchema = z.uuid();
const versionSchema = z.number().int().positive();

export async function cancelBookingAction(bookingId: string, expectedVersion: number): Promise<ApiResult<{ version: number }>> {
  if (!idSchema.safeParse(bookingId).success || !versionSchema.safeParse(expectedVersion).success) return fail("validation");
  if ((await getPatientSession()).status !== "ok") return fail("unauthenticated");
  try {
    // A patient cancels for their own reasons; provider reasons are not selectable here.
    return await dashboardBookingsApi(process.env).cancel(bookingId.toLowerCase(), { expectedVersion, reason: "patient_request" });
  } catch {
    return fail("unavailable");
  }
}

/** No reschedule contract exists on B01. Validates, then fails closed with `gated`; nothing is sent. */
export async function requestRescheduleAction(input: unknown): Promise<ApiResult<never>> {
  const parsed = rescheduleRequestSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  if ((await getPatientSession()).status !== "ok") return fail("unauthenticated");
  if (!checkReschedule(parsed.data, new Date().toISOString()).ok) return fail("validation");
  return fail("gated");
}
