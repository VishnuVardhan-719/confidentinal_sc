import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { query, requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { factCreateSchema, factListQuerySchema } from "@/lib/validation/doctor-extras";

type Context = { params: Promise<{ id: string }> };

// DC11: every fact version (with its source) and every professional review. The patient, or
// the visit's doctor when bookingId names a doctor visit of this patient (audited).
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    const id = await routeId(context);
    const v = query(request, factListQuerySchema);
    return json({ healthFacts: await dcxCommand(db, "list_health_facts", { p_patient_id: id, p_booking_id: v.bookingId ?? null }) });
  });
}

// Patient-reported fact. Source is fixed by the database (patient_reported).
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, factCreateSchema);
    return json({ fact: await dcxCommand(db, "record_health_fact", { p_patient_id: id, p_kind: v.kind, p_statement: v.statement, p_request_key: key }) });
  });
}
