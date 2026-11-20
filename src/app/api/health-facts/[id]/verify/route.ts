import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { factVerifySchema } from "@/lib/validation/doctor-extras";

// DC11: a professional review of one exact fact version by the started visit's verified
// doctor. The reviewer is always the caller; no body field names a reviewer.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, factVerifySchema);
    return json({ verificationId: await dcxCommand(db, "verify_health_fact", { p_fact_id: id, p_fact_version: v.factVersion,
      p_booking_id: v.bookingId, p_outcome: v.outcome, p_evidence_kind: v.evidenceKind, p_evidence_ref: v.evidenceRef, p_request_key: key }) });
  });
}
