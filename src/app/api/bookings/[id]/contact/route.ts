import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";

// POST, not GET: every allowed read writes an audit row (contract §8.4), so prefetches must not trigger it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ contact: await bookingCommand(db, "get_assignment_contact", { p_booking_id: await routeId(context) }) });
  });
}
