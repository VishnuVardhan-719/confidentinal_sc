import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

type Command = "create_booking_request" | "save_patient_address" | "accept_booking" | "decline_booking" | "cancel_booking" | "advance_visit" | "request_reschedule" | "list_bookings" | "get_booking" | "get_provider_queue" | "list_slots" | "upsert_booking_resource" | "set_booking_availability" | "add_booking_blackout"
  | "report_patient_absent" | "interrupt_doctor_visit" | "issue_arrival_code" | "verify_arrival_code"
  | "open_arrival_fallback" | "confirm_arrival_fallback" | "get_doctor_visit" | "list_my_doctor_visits";

// Database gate refusals (P5 shared contract §10.1) answer 503 with the same body as an
// environment-flag refusal. Every other 55000 stays a 409 conflict.
const GATE_MESSAGES = new Set(["feature_unavailable", "feature_suspended"]);

export async function bookingCommand(db: Pick<SupabaseClient, "rpc">, name: Command, args: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.rpc(name, args);
    if (!error) return data;
    // A deadlock aborts the transaction entirely. A stale-version 40001 is not
    // retried: the caller must refetch and make a new decision.
    if (error.code === "40P01" && attempt < 2) continue;
    if (error.code === "55000" && GATE_MESSAGES.has(error.message)) throw new IdentityError(503, "feature_unavailable");
    const status = ({ "42501": 403, "P0002": 404, "40001": 409, "40P01": 409,
      "23P01": 409, "23505": 409, "55000": 409, "23503": 422, "23514": 422,
      "22023": 422, "22007": 422, "22008": 422, "22003": 422, "57014": 503,
      "53300": 429 } as Record<string, number>)[error.code] ?? 503;
    throw new IdentityError(status, ({ 403: "forbidden", 404: "not_found", 409: "conflict", 422: "invalid_input", 429: "rate_limited" } as Record<number, string>)[status] ?? "booking_unavailable");
  }
  throw new IdentityError(503, "booking_unavailable");
}
