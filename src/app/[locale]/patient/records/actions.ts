"use server";

import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import type { PdfLink } from "@/modules/clinical/types";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import { getRecordsApi } from "@/modules/records";

const idSchema = z.uuid();

/**
 * DC14 patient PDF link. Re-resolves the interim patient session on every call; the records API
 * (and the backend) decide whether this consultation is the patient's own signed record and issue a
 * short-lived link. The URL is returned to the caller only; it is never logged or stored.
 */
export async function requestMyRecordPdfLinkAction(consultationId: string): Promise<ApiResult<PdfLink>> {
  if (!idSchema.safeParse(consultationId).success) return fail("validation");
  const session = getPatientSession();
  if (session.status !== "ok") return fail("unauthenticated");
  try {
    return await getRecordsApi(process.env, { fixtureActor: session.fixtureActor ?? undefined }).requestMyRecordPdfLink(consultationId.toLowerCase());
  } catch {
    return fail("unavailable");
  }
}
