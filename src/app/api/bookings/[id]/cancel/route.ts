import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { decisionSchema } from "@/lib/validation/booking";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, decisionSchema);
    return json({ version: await bookingCommand(db, "cancel_booking", { p_booking_id: id, p_expected_version: v.expectedVersion, p_reason: v.reason }) });
  });
}
