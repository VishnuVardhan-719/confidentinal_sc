import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { opsCloseSchema } from "@/lib/validation/ops";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, opsCloseSchema);
    return json({ version: await bookingCommand(db, "ops_close_booking", { p_booking_id: id, p_expected_version: v.expectedVersion,
      p_outcome: v.outcome, p_reason: v.reason, p_request_key: key }) });
  });
}
