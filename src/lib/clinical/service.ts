import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

// Each route binds one of these names; the client never chooses the RPC.
export type ClinicalCommand = "save_clinical_draft" | "get_clinical_draft" | "sign_clinical_record" | "amend_clinical_record"
  | "get_clinical_record" | "list_clinical_records";

// Design A6. Version and state conflicts reach the client by name (DC05 needs stale_version to
// tell a version conflict from any other 409); content refusals at signing say what is missing.
// Everything else keeps the generic booking body, so no other database text is echoed.
export const CLINICAL_CONFLICT_CODES = new Set(["stale_version", "draft_signed", "record_superseded"]);
export const CLINICAL_CONTENT_CODES = new Set(["clinical_incomplete", "warning_unacknowledged", "allergy_conflict", "attestation_required"]);
const FEATURE_GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);
// Same table as bookingCommand in src/lib/booking/service.ts (parity test in tests/unit/clinical-http.test.ts).
const STATUS: Record<string, number> = { "42501": 403, "P0002": 404, "40001": 409, "40P01": 409,
  "23P01": 409, "23505": 409, "55000": 409, "23503": 422, "23514": 422,
  "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503, "53300": 429 };
const BODY: Record<number, string> = { 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" };

export async function clinicalCommand(db: Pick<SupabaseClient, "rpc">, name: ClinicalCommand, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    // Deadlocks abort the whole transaction and are retried; stale versions are not.
    if (error.code === "40P01" && attempt < 2) continue;
    if (error.code === "55000" && FEATURE_GATE_MESSAGES.has(error.message)) throw new IdentityError(503, "feature_unavailable");
    if ((error.code === "55000" || error.code === "40001") && CLINICAL_CONFLICT_CODES.has(error.message)) throw new IdentityError(409, error.message);
    if (error.code === "22023" && CLINICAL_CONTENT_CODES.has(error.message)) throw new IdentityError(422, error.message);
    const status = STATUS[error.code] ?? 503;
    throw new IdentityError(status, BODY[status] ?? "booking_unavailable");
  }
  throw new IdentityError(503, "booking_unavailable");
}
