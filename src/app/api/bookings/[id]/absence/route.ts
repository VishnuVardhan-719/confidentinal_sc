import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand, requireDoctorVisits } from "@/lib/booking/service";
import { advanceSchema } from "@/lib/validation/booking";

// Assigned doctor at the door reports nobody is there. Recorded for review; no fee, no no_show.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    requireDoctorVisits();
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, advanceSchema);
    return json({ version: await bookingCommand(db, "report_patient_absent", { p_booking_id: id, p_expected_version: v.expectedVersion }) });
  });
}
