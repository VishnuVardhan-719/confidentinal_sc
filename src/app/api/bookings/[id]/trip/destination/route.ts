import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import type { IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";

// Audited destination read for the assigned driver (or ops while an exception is open).
// The pickup address and contact come from the shared POST /api/bookings/:id/contact
// (get_assignment_contact). POST because PostgREST runs GET RPCs read-only.
export async function POST(request: Request, context: IdContext) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ destination: await ambulanceCommand(db, "get_trip_destination", { p_booking_id: await routeId(context) }) });
  });
}
