import { endpoint, input, json, session } from "@/lib/auth/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { vehicleSchema } from "@/lib/validation/ambulance";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, vehicleSchema);
    return json({ version: await ambulanceCommand(db, "register_ambulance_vehicle", { p_provider_id: v.providerId, p_resource_id: v.resourceId,
      p_vehicle_type: v.vehicleType, p_supports: v.supports, p_expected_version: v.expectedVersion }) });
  });
}
