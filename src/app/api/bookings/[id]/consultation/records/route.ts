import { connection } from "next/server";
import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { clinicalCommand } from "@/lib/clinical/service";

// DC09: signed versions of one visit for the linked patient (or the signer). No content, no drafts.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json(await clinicalCommand(db, "list_clinical_records", { p_booking_id: await routeId(context) }));
  });
}