import { connection } from "next/server";
import { endpoint, json, session } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";

// DC10: the visit state and the payment state side by side. Read only: no body or query field
// can set either state. The visit block is returned even when pay-after is off (payment null).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json({ status: await dcxCommand(db, "get_visit_payment_status", { p_booking_id: await routeId(context) }) });
  });
}
