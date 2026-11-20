import { connection } from "next/server";
import { endpoint, json, session } from "@/lib/auth/http";
import { query, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { progressQuerySchema } from "@/lib/validation/doctor-extras";

// DC03: minimal visit progress for polling (src/lib/doctor-extras/progress-poll.ts). State,
// substate, version and the {version, reason, occurred_at} events after afterVersion. No actor,
// address, contact, amount or clinical field. Patient or the visit's doctor; others 404.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    const id = await routeId(context);
    const v = query(request, progressQuerySchema);
    return json({ progress: await dcxCommand(db, "get_visit_progress", { p_booking_id: id, p_after_version: v.afterVersion }) });
  });
}
