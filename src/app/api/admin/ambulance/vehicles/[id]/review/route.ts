import { endpoint, input, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import type { IdContext } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { vehicleReviewSchema } from "@/lib/validation/ambulance";

export async function POST(request: Request, context: IdContext) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const v = await input(request, vehicleReviewSchema);
    return json({ version: await ambulanceCommand(db, "review_vehicle_case", { p_resource_id: id, p_decision: v.decision,
      p_reason: v.reason, p_expected_version: v.expectedVersion }) });
  });
}
