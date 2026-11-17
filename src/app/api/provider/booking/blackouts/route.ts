import { endpoint, input, json, session } from "@/lib/auth/http";
import { bookingCommand } from "@/lib/booking/service";
import { blackoutSchema } from "@/lib/validation/booking";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, blackoutSchema);
    return json({ id: await bookingCommand(db, "add_booking_blackout", { p_provider_id: v.providerId, p_resource_id: v.resourceId,
      p_start_at: v.startAt, p_end_at: v.endAt, p_reason: v.reason, p_expected_version: v.expectedVersion }) }, 201);
  });
}
