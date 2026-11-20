import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { listExceptionsSchema } from "@/lib/validation/ops";

// Ops queue (booking:incident holders). Ids, times, states and exception metadata only; no contact.
export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, listExceptionsSchema);
    const items = await bookingCommand(db, "list_booking_exceptions", { p_limit: v.limit, p_after_booking: v.after ?? null });
    return json({ items });
  });
}
