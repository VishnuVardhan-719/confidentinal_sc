import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { clinicalCommand } from "@/lib/clinical/service";
import { draftSaveSchema } from "@/lib/validation/clinical";

// DC04/DC05: the assigned doctor's own draft. Anyone else gets 404.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json({ draft: await clinicalCommand(db, "get_clinical_draft", { p_booking_id: await routeId(context) }) });
  });
}

// Keyed autosave. A retry with the same Idempotency-Key and body returns the saved version.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, draftSaveSchema);
    return json({ version: await clinicalCommand(db, "save_clinical_draft", { p_booking_id: id, p_expected_version: v.expectedVersion,
      p_content: v.content, p_request_key: key }) });
  });
}