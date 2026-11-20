import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { clinicalCommand } from "@/lib/clinical/service";
import { amendSchema } from "@/lib/validation/clinical";

// DC07: append-only correction of the latest signed version by its signer.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, amendSchema);
    return json({ recordId: await clinicalCommand(db, "amend_clinical_record", { p_record_id: id, p_content: v.content, p_reason: v.reason,
      p_authored_confirmed: v.authoredConfirmed, p_allergies_reviewed: v.allergiesReviewed, p_request_key: key }) }, 201);
  });
}