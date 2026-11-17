import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey } from "@/lib/catalog/http";
import { catalogCommand } from "@/lib/catalog/service";
import { coverageSchema } from "@/lib/validation/catalog";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, coverageSchema);
    return json({ area: await catalogCommand(db, "propose_service_area", { p_provider_id: v.providerId, p_pin: v.pin,
      p_expected_version: v.expectedVersion, p_request_key: requestKey(request) }) }, 201);
  });
}
