import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { query, requestKey } from "@/lib/catalog/http";
import { catalogCommand, privateCatalog } from "@/lib/catalog/service";
import { serviceSchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const { providerId } = query(request, z.strictObject({ providerId: z.uuid() }));
    return json(await privateCatalog(db, providerId));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, serviceSchema);
    return json({ service: await catalogCommand(db, "upsert_service", {
      p_provider_id: v.providerId, p_catalog_type_id: v.catalogTypeId, p_title: v.title,
      p_description: v.description, p_duration_minutes: v.durationMinutes, p_status: v.status,
      p_expected_version: v.expectedVersion, p_request_key: requestKey(request),
    }) }, 201);
  });
}
