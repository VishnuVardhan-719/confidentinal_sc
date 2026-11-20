import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";

// DC13: audited 60-second read ticket for one photo. No signed URL is ever issued; the client
// downloads with its own session while the ticket is live.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ ticket: await dcxCommand(db, "authorize_visit_photo_read", { p_photo_id: await routeId(context) }) });
  });
}
