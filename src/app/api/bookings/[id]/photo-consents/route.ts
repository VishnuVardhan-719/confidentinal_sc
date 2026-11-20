import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { photoConsentSchema } from "@/lib/validation/doctor-extras";

// DC13: the patient's purpose-specific consent for one doctor visit. Optional; a visit or a
// record never requires it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, photoConsentSchema);
    return json({ consentId: await dcxCommand(db, "grant_photo_consent", { p_booking_id: id, p_purpose: v.purpose, p_policy_version: v.policyVersion, p_request_key: key }) });
  });
}
