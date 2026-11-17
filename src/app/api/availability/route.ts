import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { availabilitySchema } from "@/lib/validation/booking";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, availabilitySchema);
    return json({ slots: await bookingCommand(db, "list_slots", { p_provider_id: v.provider, p_service_id: v.service, p_date: v.date }), advisory: true });
  });
}
