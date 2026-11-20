import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { clinicalCommand } from "@/lib/clinical/service";
import { signSchema } from "@/lib/validation/clinical";

// DC07/DC08: freezes the draft version the clinician reviewed into an immutable record.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, signSchema);
    return json({ recordId: await clinicalCommand(db, "sign_clinical_record", { p_booking_id: id, p_expected_version: v.expectedVersion,
      p_authored_confirmed: v.authoredConfirmed, p_allergies_reviewed: v.allergiesReviewed, p_request_key: key }) }, 201);
  });
}