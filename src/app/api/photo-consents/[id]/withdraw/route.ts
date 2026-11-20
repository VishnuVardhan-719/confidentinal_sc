import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { photoWithdrawSchema } from "@/lib/validation/doctor-extras";

// DC13: withdrawal is never gated. Object reads stop at once; deletion is scheduled.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, photoWithdrawSchema);
    return json({ version: await dcxCommand(db, "withdraw_photo_consent", { p_consent_id: id, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
