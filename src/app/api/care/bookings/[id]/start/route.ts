import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";
import { careStepSchema } from "@/lib/validation/care";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, careStepSchema);
    return json({ version: await careCommand(db, "advance_care", { p_booking_id: id, p_step: "started", p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
