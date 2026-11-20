import { connection } from "next/server";
import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { clinicalCommand } from "@/lib/clinical/service";

// DC09: one signed version. Linked patient or signer only; every read is audited in the database.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json({ record: await clinicalCommand(db, "get_clinical_record", { p_record_id: await routeId(context) }) });
  });
}