import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

export type AmbulanceCommand =
  | "list_transport_slots" | "request_transport" | "accept_transport" | "advance_trip" | "get_trip"
  | "get_trip_destination" | "list_trip_queue" | "list_driver_trips" | "get_fleet" | "register_ambulance_vehicle"
  | "add_vehicle_document" | "submit_vehicle_case" | "set_ambulance_driver" | "authorize_vehicle_document_read"
  | "review_vehicle_case";

// P5 database gates (contract A10.1): closed or suspended answers like the env flag, 503.
const GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);
// Stable conflict codes the client can act on. Anything else stays a generic code.
const CONFLICT_MESSAGES = new Set([
  "resource_busy", "eligibility_blocked", "too_early", "requirement_unavailable", "overlapping_request",
  "accept_window_closed", "resource_ineligible", "invalid_transition", "credentials_required", "review_incomplete",
  "exception_open", "stale_version", "idempotency_conflict", "offer_changed", "schedule_changed", "resource_in_use",
]);
const STATUS: Record<string, number> = { "42501": 403, "P0002": 404, "40001": 409, "40P01": 409, "23P01": 409, "23505": 409,
  "55000": 409, "23503": 422, "23514": 422, "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503, "53300": 429 };
const CODES: Record<number, string> = { 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" };

export function ambulanceError(code: string, message: string): IdentityError {
  if (code === "55000" && GATE_MESSAGES.has(message)) return new IdentityError(503, "feature_unavailable");
  if ((code === "55000" || code === "40001") && CONFLICT_MESSAGES.has(message)) return new IdentityError(409, message);
  // The exclusion constraint names no other booking; neither does the answer.
  if (code === "23P01") return new IdentityError(409, "resource_conflict");
  const status = STATUS[code] ?? 503;
  return new IdentityError(status, CODES[status] ?? "ambulance_unavailable");
}

/** One fixed RPC per call site; the name is never taken from the request. */
export async function ambulanceCommand(db: Pick<SupabaseClient, "rpc">, name: AmbulanceCommand, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    // A deadlock aborts the whole transaction; a stale version is never retried.
    if (error.code === "40P01" && attempt < 2) continue;
    throw ambulanceError(error.code, error.message);
  }
  throw new IdentityError(503, "ambulance_unavailable");
}
