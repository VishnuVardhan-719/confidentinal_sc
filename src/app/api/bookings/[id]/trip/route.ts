import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import type { IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";

export async function GET(request: Request, context: IdContext) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ trip: await ambulanceCommand(db, "get_trip", { p_booking_id: await routeId(context) }) });
  });
}
