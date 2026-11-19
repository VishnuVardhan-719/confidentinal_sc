import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { advanceSchema } from "@/lib/validation/booking";

// Support-assisted arrival fallback, step 2: the patient confirms in their own session that
// the doctor is at the door. Only this step moves the visit to arrival_verified.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, advanceSchema);
    return json({ version: await bookingCommand(db, "confirm_arrival_fallback", { p_booking_id: id, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
