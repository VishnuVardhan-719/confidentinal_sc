import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";
import { careInterruptSchema } from "@/lib/validation/care";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, careInterruptSchema);
    return json({ version: await careCommand(db, "interrupt_care", { p_booking_id: id, p_reason: v.reason, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
