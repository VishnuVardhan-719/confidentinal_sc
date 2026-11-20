import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

// DC-extras RPCs (supabase/migrations/2026111700240*-245*). Each route binds one name; the
// client never chooses the RPC.
export type DcxCommand =
  | "get_visit_progress" | "get_visit_payment_status"
  | "record_health_fact" | "revise_health_fact" | "verify_health_fact" | "list_health_facts"
  | "issue_visit_proof" | "revoke_visit_proof" | "list_visit_proofs" | "verify_visit_proof"
  | "grant_photo_consent" | "withdraw_photo_consent" | "register_visit_photo" | "authorize_visit_photo_read" | "list_visit_photos"
  | "get_clinical_report_source" | "record_clinical_report";

// Database messages passed through as { error: { code } }. Everything else keeps the generic
// body for its status, so no other database text reaches the client.
export const DCX_PASS_THROUGH: Record<string, number> = {
  stale_version: 409, already_reviewed: 409, consent_required: 403,
  proof_limit: 429, photo_limit: 429, fact_limit: 429, report_limit: 429,
};
const FEATURE_GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);
// Same table as bookingCommand in src/lib/booking/service.ts (parity test in tests/unit/doctor-extras-http.test.ts).
export const DCX_STATUS: Record<string, number> = { "42501": 403, "P0002": 404, "40001": 409, "40P01": 409,
  "23P01": 409, "23505": 409, "55000": 409, "23503": 422, "23514": 422,
  "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503, "53300": 429 };
const BODY: Record<number, string> = { 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" };

export async function dcxCommand(db: Pick<SupabaseClient, "rpc">, name: DcxCommand, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    // Deadlocks abort the whole transaction and are retried; stale versions are not.
    if (error.code === "40P01" && attempt < 2) continue;
    // A closed or suspended DC gate is 503, like the other P5 gates (contract A10.1).
    if (error.code === "55000" && FEATURE_GATE_MESSAGES.has(error.message)) throw new IdentityError(503, "feature_unavailable");
    const status = DCX_STATUS[error.code] ?? 503;
    if (DCX_PASS_THROUGH[error.message] === status) throw new IdentityError(status, error.message);
    throw new IdentityError(status, BODY[status] ?? "booking_unavailable");
  }
  throw new IdentityError(503, "booking_unavailable");
}
