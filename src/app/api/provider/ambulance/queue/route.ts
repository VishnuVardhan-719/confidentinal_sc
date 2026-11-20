import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { tripQueueSchema } from "@/lib/validation/ambulance";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, tripQueueSchema);
    return json({ items: await ambulanceCommand(db, "list_trip_queue", { p_provider_id: v.providerId, p_limit: v.limit, p_after: v.cursor ?? null }) });
  });
}
