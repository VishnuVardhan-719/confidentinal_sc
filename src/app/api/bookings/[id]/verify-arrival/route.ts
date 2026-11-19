import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand, requireDoctorVisits } from "@/lib/booking/service";
import { verifyArrivalSchema } from "@/lib/validation/booking";

// Assigned doctor enters the code the patient reads out. A wrong code is counted in the
// database (5 per code) and answered 422 with the attempts left; the code is never echoed.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    requireDoctorVisits();
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, verifyArrivalSchema);
    const result = await bookingCommand(db, "verify_arrival_code", { p_booking_id: id, p_code: v.code, p_expected_version: v.expectedVersion }) as
      { verified: boolean; version?: number; attempts_remaining?: number };
    if (!result.verified) return json({ error: { code: "arrival_code_invalid" }, attemptsRemaining: result.attempts_remaining ?? 0 }, 422);
    return json({ version: result.version });
  });
}
