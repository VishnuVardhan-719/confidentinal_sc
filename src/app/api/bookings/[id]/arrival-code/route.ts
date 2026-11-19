import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand, requireDoctorVisits } from "@/lib/booking/service";

// Patient only, after the doctor reports arrival. The code is returned once with
// no-store headers and is never logged; the patient reads it to the doctor in person.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    requireDoctorVisits();
    const { db } = await session(request);
    const id = await routeId(context);
    const issued = await bookingCommand(db, "issue_arrival_code", { p_booking_id: id }) as { code: string; expires_at: string };
    return json({ code: issued.code, expiresAt: issued.expires_at });
  });
}
