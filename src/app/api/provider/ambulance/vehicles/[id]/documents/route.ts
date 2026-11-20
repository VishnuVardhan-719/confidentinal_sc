import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import type { IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { vehicleDocumentSchema } from "@/lib/validation/ambulance";

// Reserves a document slot; the bytes go to Storage under the returned object_name.
export async function POST(request: Request, context: IdContext) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, vehicleDocumentSchema);
    return json({ document: await ambulanceCommand(db, "add_vehicle_document", { p_resource_id: id, p_kind: v.kind,
      p_content_type: v.contentType, p_expires_at: v.expiresAt, p_expected_version: v.expectedVersion }) }, 201);
  });
}
