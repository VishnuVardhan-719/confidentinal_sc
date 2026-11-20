import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

// Each route binds one of these names; the client never chooses the RPC.
export type CareCommand = "get_care_service_tasks" | "set_care_service_tasks" | "get_care_plan" | "advance_care" | "interrupt_care" | "attest_care";

// Database messages that reach the client as 409 { error: { code } } (design §6.6). Everything
// else keeps the generic booking body, so no other database text is echoed.
export const CARE_CONFLICT_CODES = new Set(["care_too_early", "care_window_closed", "offer_changed", "care_plan_missing"]);
const FEATURE_GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);
// Same table as bookingCommand in src/lib/booking/service.ts (parity test in tests/unit/care-http.test.ts).
const STATUS: Record<string, number> = { "42501": 403, "P0002": 404, "40001": 409, "40P01": 409,
  "23P01": 409, "23505": 409, "55000": 409, "23503": 422, "23514": 422,
  "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503, "53300": 429 };
const BODY: Record<number, string> = { 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" };

export async function careCommand(db: Pick<SupabaseClient, "rpc">, name: CareCommand, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    // Deadlocks abort the whole transaction and are retried; stale versions are not.
    if (error.code === "40P01" && attempt < 2) continue;
    // Contract §10.1: a closed or suspended gate is 503, like an env flag that is off.
    if (error.code === "55000" && FEATURE_GATE_MESSAGES.has(error.message)) throw new IdentityError(503, "feature_unavailable");
    if ((error.code === "55000" || error.code === "40001") && CARE_CONFLICT_CODES.has(error.message)) throw new IdentityError(409, error.message);
    const status = STATUS[error.code] ?? 503;
    throw new IdentityError(status, BODY[status] ?? "booking_unavailable");
  }
  throw new IdentityError(503, "booking_unavailable");
}
