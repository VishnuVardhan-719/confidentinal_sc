import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ carePlan: await careCommand(db, "get_care_plan", { p_booking_id: await routeId(context) }) });
  });
}
