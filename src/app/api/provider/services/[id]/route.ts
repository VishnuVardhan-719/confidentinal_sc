import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { catalogCommand } from "@/lib/catalog/service";
import { serviceSchema } from "@/lib/validation/catalog";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, serviceSchema);
    return json({ service: await catalogCommand(db, "upsert_service", {
      p_service_id: id, p_provider_id: v.providerId, p_catalog_type_id: v.catalogTypeId, p_title: v.title,
      p_description: v.description, p_duration_minutes: v.durationMinutes, p_status: v.status, p_expected_version: v.expectedVersion,
    }) });
  });
}
