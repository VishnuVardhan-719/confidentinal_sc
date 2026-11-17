import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { catalogCommand } from "@/lib/catalog/service";
import { priceSchema } from "@/lib/validation/catalog";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, priceSchema);
    return json(await catalogCommand(db, "publish_price_version", { p_service_id: id, p_amount_paise: v.amountPaise,
      p_terms_version: v.termsVersion, p_expected_version: v.expectedVersion, p_request_key: requestKey(request) }), 201);
  });
}
