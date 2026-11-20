import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { admissionOpen, type IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { transportAcceptSchema } from "@/lib/validation/ambulance";

export async function POST(request: Request, context: IdContext) {
  return endpoint(async () => {
    await admissionOpen();
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, transportAcceptSchema);
    return json({ version: await ambulanceCommand(db, "accept_transport", { p_booking_id: id, p_expected_version: v.expectedVersion,
      p_driver_resource_id: v.driverResourceId, p_vehicle_resource_id: v.vehicleResourceId, p_request_key: key }) });
  });
}
