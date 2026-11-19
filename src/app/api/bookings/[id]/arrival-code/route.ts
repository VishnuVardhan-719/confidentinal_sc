import { endpoint, json, session } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";

// Patient only, after the doctor reports arrival. Keyed: a retry with the same
// Idempotency-Key returns the same code while it is still valid; a new key is a
// regeneration under the database limits. The code is returned with no-store headers and
// never logged; the patient reads it to the doctor in person. The request takes no body.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    if ((await request.text()).length > 0) throw new IdentityError(422, "invalid_input");
    const issued = await bookingCommand(db, "issue_arrival_code", { p_booking_id: id, p_request_key: key }) as { code: string; expires_at: string };
    return json({ code: issued.code, expiresAt: issued.expires_at });
  });
}
