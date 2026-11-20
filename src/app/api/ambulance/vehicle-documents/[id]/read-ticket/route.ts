import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import type { IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { readTicketSchema } from "@/lib/validation/ambulance";

// Audited 60-second read ticket. No signed URL is ever issued.
export async function POST(request: Request, context: IdContext) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, readTicketSchema);
    const rows = await ambulanceCommand(db, "authorize_vehicle_document_read", { p_document_id: id, p_purpose: v.purpose });
    return json({ ticket: Array.isArray(rows) ? rows[0] ?? null : rows });
  });
}
