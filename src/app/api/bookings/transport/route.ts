import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey } from "@/lib/catalog/http";
import { admissionOpen } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { transportRequestSchema } from "@/lib/validation/ambulance";

// Scheduled, non-emergency transfer request. In an emergency call 112.
export async function POST(request: Request) {
  return endpoint(async () => {
    await admissionOpen();
    const { db } = await session(request);
    const key = requestKey(request);
    const v = await input(request, transportRequestSchema);
    const id = await ambulanceCommand(db, "request_transport", { p_patient_id: v.patientId, p_service_id: v.serviceId,
      p_pickup_address_id: v.pickupAddressId, p_destination_address_id: v.destinationAddressId, p_requirement_code: v.requirement,
      p_start_at: v.startAt, p_request_key: key });
    return json({ id }, 201);
  });
}
