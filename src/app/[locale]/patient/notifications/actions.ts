"use server";

import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";

import { getPatientSession } from "@/modules/patient-dashboard/session";
import { patientNotificationsApi } from "./api";

const idSchema = z.uuid();
const versionSchema = z.number().int().positive();

/**
 * Mark one notification as read. Untrusted input is re-validated here and by the module; the
 * expected version guards against overwriting a newer server state. Nothing is logged.
 */
export async function markNotificationReadAction(id: string, expectedVersion: number): Promise<ApiResult<{ version: number }>> {
  if (!idSchema.safeParse(id).success || !versionSchema.safeParse(expectedVersion).success) return fail("validation");
  if (getPatientSession().status !== "ok") return fail("unauthenticated");
  try {
    const r = await patientNotificationsApi(process.env).markRead(id.toLowerCase(), { expectedVersion });
    return r.ok ? ok({ version: r.data.version }) : r;
  } catch {
    return fail("unavailable");
  }
}
