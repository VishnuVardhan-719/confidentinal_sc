import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { fleetQuerySchema } from "@/lib/validation/ambulance";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, fleetQuerySchema);
    return json({ fleet: await ambulanceCommand(db, "get_fleet", { p_provider_id: v.providerId }) });
  });
}
