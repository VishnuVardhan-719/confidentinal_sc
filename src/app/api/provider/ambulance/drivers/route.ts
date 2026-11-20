import { endpoint, input, json, session } from "@/lib/auth/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { driverRosterSchema } from "@/lib/validation/ambulance";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, driverRosterSchema);
    return json({ version: await ambulanceCommand(db, "set_ambulance_driver", { p_provider_id: v.providerId, p_resource_id: v.resourceId,
      p_status: v.status, p_expected_version: v.expectedVersion }) });
  });
}
