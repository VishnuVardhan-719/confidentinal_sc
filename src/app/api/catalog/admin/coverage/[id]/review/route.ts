import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { catalogCommand } from "@/lib/catalog/service";
import { coverageReviewSchema } from "@/lib/validation/catalog";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, coverageReviewSchema);
    return json({ area: await catalogCommand(db, "review_service_area", { p_area_id: id, p_decision: v.decision,
      p_reason: v.reason, p_expected_version: v.expectedVersion, p_valid_until: v.validUntil ?? null }) });
  });
}
