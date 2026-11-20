import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";

// Patient's doctor-visit view: milestones, the doctor's name and credential status, and any
// review in progress. No phone, address or internal ids. Anyone else gets 404.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ visit: await bookingCommand(db, "get_doctor_visit", { p_booking_id: await routeId(context) }) });
  });
}
