import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ booking: await bookingCommand(db, "get_booking", { p_booking_id: await routeId(context) }) });
  });
}
