import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";
import { careAttestSchema } from "@/lib/validation/care";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, careAttestSchema);
    return json({ version: await careCommand(db, "attest_care", { p_booking_id: id, p_decision: v.decision, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
