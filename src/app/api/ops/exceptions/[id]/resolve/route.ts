import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { bookingCommand } from "@/lib/booking/service";
import { opsResolveSchema } from "@/lib/validation/ops";

// absence_reported exceptions resolve only through POST /api/ops/bookings/{id}/close.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, opsResolveSchema);
    return json({ version: await bookingCommand(db, "ops_resolve_exception", { p_exception_id: id, p_expected_version: v.expectedVersion,
      p_resolution: v.resolution, p_request_key: key }) });
  });
}
