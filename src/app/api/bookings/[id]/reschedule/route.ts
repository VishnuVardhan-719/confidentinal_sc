import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { rescheduleSchema } from "@/lib/validation/booking";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, rescheduleSchema);
    return json({ id: await bookingCommand(db, "request_reschedule", { p_booking_id: id, p_expected_version: v.expectedVersion,
      p_start_at: v.startAt, p_request_key: requestKey(request) }) }, 201);
  });
}
