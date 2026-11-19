"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getConsultationNotesApi, type ConsultationNote, type SaveNoteInput, type SignOffInput } from "@/modules/consultation-notes";
import { parseRouteId } from "@/modules/doctor/routing";
import { getDoctorSession } from "@/modules/doctor/session";

/**
 * Server actions for post-visit documents. Each call re-resolves the doctor session; inputs are
 * untrusted (re-validated by the adapter and the backend). Nothing is logged: notes are clinical text.
 */
async function notesApi() {
  const s = await getDoctorSession();
  return s.guard.status === "ok" ? getConsultationNotesApi(process.env, s.ctx) : null;
}

export async function saveNoteDraftAction(bookingId: string, input: SaveNoteInput): Promise<ApiResult<ConsultationNote>> {
  const id = parseRouteId(bookingId);
  if (!id) return fail("not_found");
  const api = await notesApi();
  if (!api) return fail("unauthenticated");
  return api.saveDraft(id, input);
}

export async function signOffNoteAction(bookingId: string, input: SignOffInput): Promise<ApiResult<ConsultationNote>> {
  const id = parseRouteId(bookingId);
  if (!id) return fail("not_found");
  const api = await notesApi();
  if (!api) return fail("unauthenticated");
  return api.signOff(id, input);
}
