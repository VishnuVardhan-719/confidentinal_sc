import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { interruptSchema } from "@/lib/validation/booking";

// Assigned doctor ends the visit with a reason code. No arrival code is needed, so an
// emergency never waits on the app.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, interruptSchema);
    return json({ version: await bookingCommand(db, "interrupt_doctor_visit", { p_booking_id: id, p_expected_version: v.expectedVersion, p_reason: v.reason, p_request_key: key }) });
  });
}
