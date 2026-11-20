import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { arrivalFallbackSchema } from "@/lib/validation/booking";

// Support-assisted arrival fallback, step 1: an independent ops holder (booking:incident,
// AAL2, checked in the database) opens it after speaking to the patient. The patient must
// confirm it in their own session (./confirm). Off until the doctor_arrival_fallback gate is on.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, arrivalFallbackSchema);
    const opened = await bookingCommand(db, "open_arrival_fallback", { p_booking_id: id, p_expected_version: v.expectedVersion, p_reason: v.reason, p_request_key: key }) as
      { id: string; expires_at: string };
    return json({ id: opened.id, expiresAt: opened.expires_at }, 201);
  });
}
