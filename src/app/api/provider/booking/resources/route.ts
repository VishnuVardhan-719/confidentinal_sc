import { endpoint, input, json, session } from "@/lib/auth/http";
import { bookingCommand } from "@/lib/booking/service";
import { resourceSchema } from "@/lib/validation/booking";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, resourceSchema);
    return json({ id: await bookingCommand(db, "upsert_booking_resource", { p_provider_id: v.providerId, p_kind: v.kind,
      p_person_profile_id: v.personProfileId ?? null, p_vehicle_key: v.vehicleKey ?? null, p_expected_version: v.expectedVersion,
      p_resource_id: v.resourceId ?? null, p_status: v.status }) }, v.resourceId ? 200 : 201);
  });
}
