import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { catalogCommand } from "@/lib/catalog/service";
import { versionSchema } from "@/lib/validation/providers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, versionSchema);
    return json({ area: await catalogCommand(db, "withdraw_service_area", { p_area_id: id, p_expected_version: v.expectedVersion }) });
  });
}
