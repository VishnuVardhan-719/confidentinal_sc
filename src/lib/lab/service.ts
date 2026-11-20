import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

export type LabCommand = "set_lab_test" | "get_lab_test_public" | "list_lab_slots" | "create_lab_booking_request"
  | "accept_lab_booking" | "advance_lab_order" | "lab_close_followup" | "get_lab_order" | "list_lab_followups";
export type LabStep = "start_collection" | "report_absence" | "collected" | "handed_over" | "collection_failed" | "handoff_failed";

const GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);
const STATUS: Record<string, number> = { "42501": 403, "P0002": 404, "40001": 409, "40P01": 409, "23P01": 409, "23505": 409,
  "55000": 409, "23503": 422, "23514": 422, "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503, "53300": 429 };
const CODES: Record<number, string> = { 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" };

/** One fixed RPC per route; same status mapping and deadlock retry as bookingCommand. */
export async function labCommand(db: Pick<SupabaseClient, "rpc">, name: LabCommand, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    if (error.code === "40P01" && attempt < 2) continue;
    // Database gate closed or suspended (contract 10.1): the same 503 as the env flag.
    if (error.code === "55000" && GATE_MESSAGES.has(error.message)) throw new IdentityError(503, "feature_unavailable");
    const status = STATUS[error.code] ?? 503;
    throw new IdentityError(status, CODES[status] ?? "lab_unavailable");
  }
  throw new IdentityError(503, "lab_unavailable");
}
