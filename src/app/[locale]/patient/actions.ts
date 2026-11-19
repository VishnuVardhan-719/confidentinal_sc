"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import type { PdfLink } from "@/modules/clinical/types";
import { parseRouteId } from "@/modules/doctor/routing";
import { getNotificationsApi } from "@/modules/notifications";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getRecordsApi } from "@/modules/records";

/**
 * Patient server actions. Each call re-resolves the session; inputs are untrusted and re-validated
 * here and by the adapters/backend. Nothing is logged (results can contain PHI).
 */
function actor() {
  const s = getPatientSession();
  return s.status === "ok" ? { fixtureActor: s.fixtureActor ?? undefined } : null;
}

export async function myRecordPdfLinkAction(consultationId: string): Promise<ApiResult<PdfLink>> {
  const id = parseRouteId(consultationId);
  if (!id) return fail("not_found");
  const ctx = actor();
  if (!ctx) return fail("unauthenticated");
  return getRecordsApi(process.env, ctx).requestMyRecordPdfLink(id);
}

export async function markNotificationsReadAction(ids: string[]): Promise<ApiResult<{ updated: number }>> {
  const ctx = actor();
  if (!ctx) return fail("unauthenticated");
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((i) => typeof i === "string" && /^[A-Za-z0-9-]{1,64}$/.test(i))) return fail("validation");
  return getNotificationsApi(process.env, ctx).markRead({ ids });
}
