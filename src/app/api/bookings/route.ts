import { endpoint, input, json, session } from "@/lib/auth/http";
import { query, requestKey } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { bookingRequestSchema, listBookingsSchema } from "@/lib/validation/booking";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, bookingRequestSchema);
    const id = await bookingCommand(db, "create_booking_request", { p_patient_id: v.patientId, p_service_id: v.serviceId,
      p_address_id: v.addressId, p_start_at: v.startAt, p_request_key: requestKey(request) });
    return json({ id }, 201);
  });
}
export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = query(request, listBookingsSchema);
    const items = await bookingCommand(db, "list_bookings", { p_provider_id: v.providerId ?? null, p_limit: v.limit, p_after: v.cursor ?? null });
    return json({ items });
  });
}
