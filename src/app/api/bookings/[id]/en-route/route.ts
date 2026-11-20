import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { advanceSchema } from "@/lib/validation/booking";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, advanceSchema);
    return json({ version: await bookingCommand(db, "advance_visit", { p_booking_id: id, p_substate: "en_route", p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
