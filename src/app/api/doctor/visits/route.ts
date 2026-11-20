import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { doctorVisitsQuerySchema } from "@/lib/validation/booking";

// The signed-in doctor's own active visits. No address, phone or patient id; reading it
// writes no audit row.
export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, doctorVisitsQuerySchema);
    const items = await bookingCommand(db, "list_my_doctor_visits", { p_limit: v.limit, p_after_start: v.afterStart ?? null, p_after_id: v.afterId ?? null });
    return json({ items });
  });
}
